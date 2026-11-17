import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordBase } from "../../src/commands/base.js";
import { commitChange, mergeChange } from "../../src/commands/archive.js";
import { UsageError } from "../../src/change.js";
import { emptyLivingSpec } from "../../src/spec/template.js";
import { lintRepo } from "../../src/commands/lint.js";

let root: string;
const write = (rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const requirement = (name: string, extra = "") => `### Requirement: ${name}
As a shopper, I want ${name}, so that it works.
The system SHALL support ${name}.${extra}

#### Scenario: works
- WHEN used THEN it works
`;
const livingWith = (name: string) =>
  emptyLivingSpec("checkout").replace(
    "## User Stories\n",
    `## User Stories\n\n${requirement(name).replace("### Requirement:", "### Story:")}\n`,
  );

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "openspec-matt-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  write("openspec/config.yaml", "schema: matt\n");
  write("docs/specs/checkout.md", livingWith("guest checkout"));
  write("GLOSSARY.md", "# Shop\n");
  git("add", ".");
  git("commit", "-qm", "init");

  write("openspec/changes/add-receipts/.openspec.yaml", "# created by openspec\nschema: matt\ncreated: 2026-11-17\n");
  write("openspec/changes/add-receipts/proposal.md", "## Why\nReceipts.\n");
  write("openspec/changes/add-receipts/tasks.md", "- [x] #12 Email receipts\n");
  write(
    "openspec/changes/add-receipts/specs/checkout/spec.md",
    `## MODIFIED Requirements\n${requirement("guest checkout", "\nThe system SHALL email a receipt.")}`,
  );
  write("openspec/changes/add-receipts/specs/receipts/spec.md", `## ADDED Requirements\n${requirement("receipt pdf")}`);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("base", () => {
  it("records hashes for touched stories and keeps .openspec.yaml comments", () => {
    const base = recordBase(root, "add-receipts");
    expect(Object.keys(base)).toEqual(["checkout"]);
    const meta = read("openspec/changes/add-receipts/.openspec.yaml");
    expect(meta).toContain("# created by openspec");
    expect(meta).toMatch(/x-base:\n\s+checkout:\n\s+guest checkout: [0-9a-f]{16}/);
  });
});

describe("archive", () => {
  it("merges every capability, creating new specs, and marks the change merged", () => {
    recordBase(root, "add-receipts");
    const outcome = mergeChange(root, "add-receipts");
    expect(outcome.conflicts).toEqual([]);
    expect(outcome.applied).toEqual({ checkout: ["MODIFIED guest checkout"], receipts: ["ADDED receipt pdf"] });
    expect(outcome.created).toEqual(["receipts"]);
    expect(read("docs/specs/checkout.md")).toContain("email a receipt");
    expect(read("docs/specs/receipts.md")).toContain("### Story: receipt pdf");
    expect(read("openspec/changes/add-receipts/.openspec.yaml")).toContain("x-merged: true");
    expect(() => mergeChange(root, "add-receipts")).toThrow(UsageError);
  });

  it("writes nothing when any capability conflicts", () => {
    recordBase(root, "add-receipts");
    write("docs/specs/checkout.md", read("docs/specs/checkout.md").replace("support guest checkout.", "support guest checkout well."));
    const outcome = mergeChange(root, "add-receipts");
    expect(outcome.conflicts.map((c) => c.problems[0]!.code)).toEqual(["base-mismatch"]);
    expect(existsSync(join(root, "docs/specs/receipts.md"))).toBe(false);
    expect(read("openspec/changes/add-receipts/.openspec.yaml")).not.toContain("x-merged");
  });

  it("commits the change with the golden files, then deletes it in a second commit", () => {
    recordBase(root, "add-receipts");
    mergeChange(root, "add-receipts");
    write("GLOSSARY.md", "# Shop\n\n## Language\n\n**Receipt**: Proof of payment.\n");
    write("notes.txt", "unrelated work in progress\n");

    const outcome = commitChange(root, "add-receipts");

    expect(existsSync(join(root, "openspec/changes/add-receipts"))).toBe(false);
    const snapshotFiles = git("show", "--name-only", "--format=", outcome.snapshot!).split("\n").sort();
    expect(snapshotFiles).toEqual([
      "GLOSSARY.md",
      "docs/specs/checkout.md",
      "docs/specs/receipts.md",
      "openspec/changes/add-receipts/.openspec.yaml",
      "openspec/changes/add-receipts/proposal.md",
      "openspec/changes/add-receipts/specs/checkout/spec.md",
      "openspec/changes/add-receipts/specs/receipts/spec.md",
      "openspec/changes/add-receipts/tasks.md",
    ]);
    expect(git("status", "--porcelain")).toBe("?? notes.txt");
    expect(git("log", "--format=%s", "-2")).toBe(
      "chore(openspec): remove archived change add-receipts\ndocs(spec): archive change add-receipts",
    );
  });

  it("adds a No-Grill trailer and counts open tasks", () => {
    write("openspec/changes/add-receipts/proposal.md", "Grilling skipped: CI hotfix run\n");
    write("openspec/changes/add-receipts/tasks.md", "- [ ] #12 Email receipts\n- [x] #13 PDF\n");
    recordBase(root, "add-receipts");
    mergeChange(root, "add-receipts");
    const outcome = commitChange(root, "add-receipts");
    expect(outcome.noGrill).toBe("CI hotfix run");
    expect(outcome.openTasks).toBe(1);
    expect(git("log", "-1", "--format=%B", outcome.snapshot!)).toContain("No-Grill: CI hotfix run");
  });

  it("finishes a change the stock archive skill already moved (and synced)", () => {
    recordBase(root, "add-receipts");
    git("add", ".");
    git("commit", "-qm", "wip: planning artifacts");
    mkdirSync(join(root, "openspec/changes/archive"), { recursive: true });
    git("mv", "openspec/changes/add-receipts", "openspec/changes/archive/2026-11-17-add-receipts");
    write("openspec/specs/receipts/spec.md", "# receipts Specification\n");
    write("openspec/specs/.gitkeep", "");

    expect(lintRepo(root).map((f) => f.code)).toEqual(["unconverted-archive", "openspec-specs-used"]);
    expect(mergeChange(root, "add-receipts").conflicts).toEqual([]);
    expect(lintRepo(root).map((f) => `${f.severity}:${f.code}`)).toEqual([
      "warning:pending-archive-commit",
      "error:openspec-specs-used",
    ]);
    commitChange(root, "add-receipts");

    expect(git("status", "--porcelain")).toBe("");
    expect(git("ls-files", "openspec/changes")).toBe("");
    expect(existsSync(join(root, "openspec/specs/receipts"))).toBe(false);
    expect(existsSync(join(root, "openspec/specs/.gitkeep"))).toBe(true);
    expect(lintRepo(root)).toEqual([]);
    expect(read("docs/specs/receipts.md")).toContain("### Story: receipt pdf");
  });

  it("refuses to merge into a living spec that fails lint, writing nothing", () => {
    recordBase(root, "add-receipts");
    const before = read("docs/specs/checkout.md");
    write("docs/specs/checkout.md", before.replace("#### Scenario: works", "### Notes\nhand-written\n\n#### Scenario: works"));
    const outcome = mergeChange(root, "add-receipts");
    expect(outcome.conflicts.map((c) => c.capability)).toEqual(["checkout"]);
    expect(new Set(outcome.conflicts[0]!.problems.map((p) => p.code))).toEqual(new Set(["invalid-spec"]));
    expect(outcome.conflicts[0]!.problems[0]!.message).toContain("fix the living spec first");
    expect(existsSync(join(root, "docs/specs/receipts.md"))).toBe(false);
  });

  it("refuses a delta that would produce an invalid spec", () => {
    write(
      "openspec/changes/add-receipts/specs/receipts/spec.md",
      "## ADDED Requirements\n### Requirement: receipt pdf\nA PDF.\n\n#### Scenario: works\n- WHEN used THEN it works\n",
    );
    recordBase(root, "add-receipts");
    const outcome = mergeChange(root, "add-receipts");
    expect(outcome.conflicts.map((c) => [c.capability, c.problems[0]!.code])).toEqual([["receipts", "invalid-spec"]]);
    expect(read("docs/specs/checkout.md")).not.toContain("email a receipt");
  });

  it("skips the archive commit when the change and golden files are already committed", () => {
    write("openspec/changes/add-receipts/specs/checkout/spec.md", "");
    write("openspec/changes/add-receipts/specs/receipts/spec.md", "");
    recordBase(root, "add-receipts");
    mergeChange(root, "add-receipts");
    git("add", ".");
    git("commit", "-qm", "everything already committed");
    const outcome = commitChange(root, "add-receipts");
    expect(outcome.snapshot).toBeUndefined();
    expect(git("log", "-1", "--format=%s")).toBe("chore(openspec): remove archived change add-receipts");
  });

  it("refuses to merge into a living spec with duplicate story names", () => {
    recordBase(root, "add-receipts");
    const spec = read("docs/specs/checkout.md");
    const story = spec.slice(spec.indexOf("### Story:"), spec.indexOf("## Implementation Decisions"));
    write("docs/specs/checkout.md", spec.replace(story, story + story));
    const outcome = mergeChange(root, "add-receipts");
    expect(outcome.conflicts[0]!.problems.map((p) => p.code)).toEqual(["invalid-spec"]);
    expect(outcome.conflicts[0]!.problems[0]!.message).toContain("duplicate-story");
    expect(read("docs/specs/checkout.md")).toBe(spec.replace(story, story + story));
  });

  it("ignores dotfiles such as .DS_Store in openspec/changes/archive and openspec/specs", () => {
    write("openspec/changes/archive/.DS_Store", "");
    write("openspec/specs/.DS_Store", "");
    expect(lintRepo(root)).toEqual([]);
  });

  it("changes nothing when the change folder is gitignored", () => {
    write(".gitignore", "openspec/changes/\n");
    recordBase(root, "add-receipts");
    mergeChange(root, "add-receipts");
    expect(() => commitChange(root, "add-receipts")).toThrow(/is gitignored/);
    expect(existsSync(join(root, "openspec/changes/add-receipts/proposal.md"))).toBe(true);
  });

  it("refuses to commit before merging or with unrelated staged files", () => {
    expect(() => commitChange(root, "add-receipts")).toThrow(/not merged/);
    recordBase(root, "add-receipts");
    mergeChange(root, "add-receipts");
    write("other.txt", "x");
    git("add", "other.txt");
    expect(() => commitChange(root, "add-receipts")).toThrow(/unstage/);
  });
});
