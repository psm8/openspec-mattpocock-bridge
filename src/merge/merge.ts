import { normalizeName, sameName } from "../markdown.js";
import type { Delta } from "../delta/parse.js";
import { parseLivingSpec, renderLivingSpec, type LivingSpec, type Story } from "../spec/parse.js";
import { emptyLivingSpec } from "../spec/template.js";
import { hashStory } from "./hash.js";

export type ConflictCode = "base-mismatch" | "no-base" | "unknown-target" | "duplicate-added" | "no-user-stories";

export interface Problem {
  code: ConflictCode;
  story: string;
  message: string;
}

export class MergeConflict extends Error {
  constructor(
    readonly capability: string,
    readonly problems: Problem[],
  ) {
    super(`${capability}: ${problems.map((p) => p.message).join("; ")}`);
  }
}

export interface MergeResult {
  text: string;
  /** One line per applied operation, e.g. "MODIFIED Guest checkout". */
  applied: string[];
  created: boolean;
}

/** Story name -> base hash, as recorded at propose. */
export type BaseMap = Record<string, string>;

/** Hashes of every existing story a delta will modify, remove or rename (by its current name). */
export function baseHashes(specText: string | undefined, delta: Delta): BaseMap {
  if (specText === undefined) return {};
  const stories = parseLivingSpec(specText).stories;
  const renamedTo = new Set(delta.renamed.map((r) => normalizeName(r.to)));
  const targets = [
    ...delta.renamed.map((r) => r.from),
    ...delta.removed,
    ...delta.modified.map((m) => m.name).filter((n) => !renamedTo.has(normalizeName(n))),
  ];
  const base: BaseMap = {};
  for (const name of targets) {
    const story = stories.find((s) => sameName(s.name, name));
    if (story) base[story.name] = hashStory(story.body);
  }
  return base;
}

/**
 * Applies a delta to a living spec in OpenSpec's order: RENAMED, REMOVED, MODIFIED, ADDED.
 * Throws MergeConflict (listing every problem) instead of overwriting anything it cannot verify.
 */
export function mergeDelta(specText: string | undefined, capability: string, delta: Delta, base: BaseMap): MergeResult {
  const created = specText === undefined;
  const spec: LivingSpec = parseLivingSpec(specText ?? emptyLivingSpec(capability, delta.purpose));
  const problems: Problem[] = [];
  const applied: string[] = [];
  const find = (name: string) => spec.stories.findIndex((s) => sameName(s.name, name));
  const baseOf = (name: string) => Object.entries(base).find(([n]) => sameName(n, name))?.[1];

  if (!spec.hasUserStories) {
    throw new MergeConflict(capability, [
      { code: "no-user-stories", story: "", message: "the living spec has no '## User Stories' section; run lint" },
    ]);
  }

  const verify = (name: string, op: string): number => {
    const index = find(name);
    if (index < 0) {
      problems.push({ code: "unknown-target", story: name, message: `${op} '${name}': no such story in docs/specs/${capability}.md` });
      return -1;
    }
    const recorded = baseOf(name);
    if (recorded === undefined) {
      problems.push({ code: "no-base", story: name, message: `${op} '${name}': no base hash recorded; run 'openspec-matt base <change>' after writing the delta` });
      return -1;
    }
    if (recorded !== hashStory(spec.stories[index]!.body)) {
      problems.push({ code: "base-mismatch", story: name, message: `${op} '${name}': the story was edited after propose; merge the hand edit into the delta, then re-run base` });
      return -1;
    }
    return index;
  };

  const renamedTo = new Set(delta.renamed.map((r) => normalizeName(r.to)));
  for (const { from, to } of delta.renamed) {
    const index = verify(from, "RENAMED");
    if (index < 0) continue;
    if (find(to) >= 0) {
      problems.push({ code: "duplicate-added", story: to, message: `RENAMED to '${to}': a story with that name already exists` });
      continue;
    }
    spec.stories[index] = { ...spec.stories[index]!, name: to, raw: undefined };
    applied.push(`RENAMED ${from} -> ${to}`);
  }

  for (const name of delta.removed) {
    const index = verify(name, "REMOVED");
    if (index < 0) continue;
    spec.stories.splice(index, 1);
    applied.push(`REMOVED ${name}`);
  }

  for (const { name, body } of delta.modified) {
    // A story renamed by this same delta was already verified under its old name.
    const index = renamedTo.has(normalizeName(name)) ? find(name) : verify(name, "MODIFIED");
    if (index < 0) {
      if (renamedTo.has(normalizeName(name))) {
        problems.push({ code: "unknown-target", story: name, message: `MODIFIED '${name}': rename target not found` });
      }
      continue;
    }
    spec.stories[index] = { ...spec.stories[index]!, body, raw: undefined };
    applied.push(`MODIFIED ${name}`);
  }

  for (const { name, body } of delta.added) {
    if (find(name) >= 0) {
      problems.push({ code: "duplicate-added", story: name, message: `ADDED '${name}': a story with that name already exists; use MODIFIED` });
      continue;
    }
    const story: Story = { name, body, line: 0 };
    spec.stories.push(story);
    applied.push(`ADDED ${name}`);
  }

  if (problems.length > 0) throw new MergeConflict(capability, sortProblems(problems));
  return { text: renderLivingSpec(spec), applied, created };
}

const ORDER: ConflictCode[] = ["no-user-stories", "unknown-target", "no-base", "base-mismatch", "duplicate-added"];
function sortProblems(problems: Problem[]): Problem[] {
  return [...problems].sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
}
