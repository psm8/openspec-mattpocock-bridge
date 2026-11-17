import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ChangeMeta,
  SPECS_DIR,
  UsageError,
  livingSpecPath,
  openChange,
  readDeltas,
  readLivingSpec,
  type Change,
} from "../change.js";
import { git, stagedFiles } from "../git.js";
import { MergeConflict, mergeDelta } from "../merge/merge.js";
import { lintLivingSpec } from "../spec/lint.js";
import type { Finding } from "../lint/finding.js";

export interface MergeOutcome {
  /** Capability -> applied operations. */
  applied: Record<string, string[]>;
  created: string[];
  findings: Finding[];
  conflicts: MergeConflict[];
}

/**
 * Step 1 of archive: merge every delta into docs/specs. All-or-nothing: if any capability
 * conflicts, no file is written.
 */
export function mergeChange(root: string, name: string): MergeOutcome {
  const change = openChange(root, name);
  const meta = new ChangeMeta(change);
  if (meta.merged) throw new UsageError(`'${name}' is already merged into ${SPECS_DIR}; run 'openspec-matt archive ${name} --commit'`);

  const outcome: MergeOutcome = { applied: {}, created: [], findings: [], conflicts: [] };
  const writes: { path: string; text: string }[] = [];

  for (const { capability, delta } of readDeltas(change)) {
    try {
      const result = mergeDelta(readLivingSpec(root, capability), capability, delta, meta.base(capability));
      outcome.applied[capability] = result.applied;
      if (result.created) outcome.created.push(capability);
      outcome.findings.push(...lintLivingSpec(result.text, `${SPECS_DIR}/${capability}.md`));
      writes.push({ path: livingSpecPath(root, capability), text: result.text });
    } catch (error) {
      if (!(error instanceof MergeConflict)) throw error;
      outcome.conflicts.push(error);
    }
  }

  if (outcome.conflicts.length > 0) return outcome;

  for (const { path, text } of writes) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  meta.merged = true;
  meta.save();
  return outcome;
}

export interface CommitOutcome {
  snapshot: string;
  removal: string;
  noGrill?: string;
  openTasks: number;
}

const GOLDEN_PATHS = [SPECS_DIR, "docs/adr", "GLOSSARY.md", "GLOSSARY-MAP.md"];

/**
 * Step 2 of archive: commit the change folder together with the golden files, then delete the
 * folder in a second commit. Git history keeps the middle; the tree keeps only golden files.
 */
export function commitChange(root: string, name: string): CommitOutcome {
  const change = openChange(root, name);
  if (!new ChangeMeta(change).merged) {
    throw new UsageError(`'${name}' is not merged yet; run 'openspec-matt archive ${name}' and review the diff first`);
  }
  // The stock archive skill may have moved the folder already; its old location's removal belongs here too.
  const activeDir = `openspec/changes/${name}`;
  const ours = [change.relDir, activeDir, ...GOLDEN_PATHS, "openspec/specs"];
  const foreign = stagedFiles(root).filter((file) => !ours.some((p) => file === p || file.startsWith(`${p}/`)));
  if (foreign.length > 0) {
    throw new UsageError(`unstage these first, archive commits only the change and golden files:\n  ${foreign.join("\n  ")}`);
  }

  const noGrill = noGrillReason(change);
  const trailer = noGrill ? `\n\nNo-Grill: ${noGrill}` : "";
  const openTasks = countOpenTasks(change);

  git(root, "reset", "-q", "--", "openspec/specs");
  stage(root, [change.relDir, activeDir, ...GOLDEN_PATHS]);
  git(root, "commit", "-m", `docs(spec): archive change ${name}${trailer}`);
  const snapshot = git(root, "rev-parse", "--short", "HEAD");

  rmSync(change.dir, { recursive: true, force: true });
  // openspec/specs stays empty in this workflow; drop anything a stock "Sync now" wrote there.
  const stockSpecs = join(root, "openspec/specs");
  if (existsSync(stockSpecs)) {
    for (const entry of readdirSync(stockSpecs)) {
      if (entry !== ".gitkeep") rmSync(join(stockSpecs, entry), { recursive: true, force: true });
    }
  }
  stage(root, [change.relDir, "openspec/specs"]);
  git(root, "commit", "-m", `chore(openspec): remove archived change ${name}`);
  const removal = git(root, "rev-parse", "--short", "HEAD");

  return { snapshot, removal, noGrill, openTasks };
}

/** `git add --all` for the paths that exist or are tracked (git rejects a pathspec matching neither). */
function stage(root: string, paths: string[]): void {
  const present = paths.filter((p) => existsSync(join(root, p)) || git(root, "ls-files", "--", p) !== "");
  if (present.length > 0) git(root, "add", "--all", "--", ...present);
}

function noGrillReason(change: Change): string | undefined {
  const proposal = join(change.dir, "proposal.md");
  if (!existsSync(proposal)) return undefined;
  return /^\s*Grilling skipped:\s*(.+)$/im.exec(readFileSync(proposal, "utf8"))?.[1]?.trim();
}

function countOpenTasks(change: Change): number {
  const tasks = join(change.dir, "tasks.md");
  if (!existsSync(tasks)) return 0;
  return (readFileSync(tasks, "utf8").match(/^\s*[-*+]\s+\[ \]/gm) ?? []).length;
}
