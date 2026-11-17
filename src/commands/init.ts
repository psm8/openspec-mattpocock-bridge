import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Scalar, parseDocument, type Document } from "yaml";
import { SPECS_DIR, UsageError } from "../change.js";

export const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

export const MATT_SKILLS = [
  "grilling",
  "domain-modeling",
  "to-tickets",
  "implement",
  "tdd",
  "code-review",
  "diagnosing-bugs",
  "setup-matt-pocock-skills",
];
export const SKILLS_CLI = "skills@1.9.0";

const CONTEXT_MARKER = "This project uses openspec-matt";

export interface InitOptions {
  ci?: "github" | "gitlab" | "none";
  installMatt?: boolean;
}

export interface InitReport {
  done: string[];
  next: string[];
}

export function init(root: string, options: InitOptions = {}): InitReport {
  if (!existsSync(join(root, "openspec"))) {
    throw new UsageError("no openspec/ directory; run 'openspec init' first so OpenSpec installs its skills for your agent");
  }
  const report: InitReport = { done: [], next: [] };

  for (const schema of ["matt", "matt-lite"]) {
    cpSync(join(ASSETS, "schemas", schema), join(root, "openspec", "schemas", schema), { recursive: true });
  }
  report.done.push("copied schemas matt and matt-lite to openspec/schemas/");

  mergeConfig(root);
  report.done.push("set openspec/config.yaml: schema matt, context, archive guidance");

  const specs = join(root, SPECS_DIR);
  if (!existsSync(specs)) {
    mkdirSync(specs, { recursive: true });
    writeFileSync(join(specs, ".gitkeep"), "");
    report.done.push(`created ${SPECS_DIR}/`);
  }

  const ci = options.ci ?? detectCi(root);
  if (ci === "github") {
    copyAsset("ci/github-action.yml", join(root, ".github/workflows/openspec-matt.yml"));
    report.done.push("added .github/workflows/openspec-matt.yml (golden-file lint)");
  } else if (ci === "gitlab") {
    copyAsset("ci/gitlab-ci.yml", join(root, ".gitlab/openspec-matt.yml"));
    report.done.push("added .gitlab/openspec-matt.yml");
    report.next.push("add to .gitlab-ci.yml:  include: { local: .gitlab/openspec-matt.yml }");
  }

  copyAsset("skills/matt-bootstrap/SKILL.md", join(root, ".agents/skills/matt-bootstrap/SKILL.md"));
  if (existsSync(join(root, ".claude"))) {
    copyAsset("skills/matt-bootstrap/SKILL.md", join(root, ".claude/skills/matt-bootstrap/SKILL.md"));
  }
  report.done.push("added the matt-bootstrap skill");

  // --copy: the skills CLI's symlinks are absolute paths, which break for anyone else who clones the repo.
  // -a codex writes the universal .agents/skills (read by most agents); claude-code adds .claude/skills,
  // the same layout `openspec init` uses. Without -a, --copy also fills folders for agents the repo doesn't use.
  const install = ["-y", SKILLS_CLI, "add", "mattpocock/skills", "-s", ...MATT_SKILLS, "-a", "claude-code", "codex", "--copy", "-y"];
  if (options.installMatt) {
    // A fixed command string (no user input), run through the shell so npx's .cmd shim works on Windows.
    execSync(`npx ${install.join(" ")}`, { cwd: root, stdio: "inherit" });
    report.done.push(`installed Matt's skills (${MATT_SKILLS.join(", ")}), pinned in skills-lock.json`);
  } else {
    report.next.push(`install Matt's skills, pinned in skills-lock.json:  npx ${install.join(" ")}`);
  }
  report.next.push("run Matt's /setup-matt-pocock-skills to choose the issue tracker (writes docs/agents/issue-tracker.md)");
  if (existsSync(join(root, "CONTEXT.md")) && !existsSync(join(root, "GLOSSARY.md"))) {
    report.next.push("rename CONTEXT.md to GLOSSARY.md (Matt's current name):  git mv CONTEXT.md GLOSSARY.md");
  }
  report.next.push("optional, for an existing codebase: ask your agent to run the matt-bootstrap skill to draft docs/specs/");
  return report;
}

function mergeConfig(root: string): void {
  const path = join(root, "openspec", "config.yaml");
  const ours = parseDocument(readFileSync(join(ASSETS, "config.snippet.yaml"), "utf8"));
  const doc: Document = parseDocument(existsSync(path) ? readFileSync(path, "utf8") : "");
  if (doc.contents === null) doc.contents = doc.createNode({}) as never;

  doc.set("schema", "matt");

  const literal = (text: string) => {
    const node = doc.createNode(text) as Scalar;
    node.type = Scalar.BLOCK_LITERAL;
    return node;
  };

  const ourContext = String(ours.get("context"));
  const existing = doc.get("context");
  if (typeof existing !== "string" || existing.trim() === "") doc.set("context", literal(ourContext));
  else if (!existing.includes(CONTEXT_MARKER)) doc.set("context", literal(`${existing.trimEnd()}\n\n${ourContext}`));

  // OpenSpec only accepts guidance as a list of strings; copy our node as-is to keep its formatting.
  doc.setIn(["operations", "archive", "guidance"], ours.getIn(["operations", "archive", "guidance"], true));
  writeFileSync(path, doc.toString({ lineWidth: 0 }));
}

function detectCi(root: string): "github" | "gitlab" | "none" {
  if (existsSync(join(root, ".gitlab-ci.yml"))) return "gitlab";
  if (existsSync(join(root, ".github"))) return "github";
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    if (remote.includes("github")) return "github";
    if (remote.includes("gitlab")) return "gitlab";
  } catch {
    // no remote
  }
  return "none";
}

function copyAsset(asset: string, target: string): void {
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(ASSETS, asset), target);
}
