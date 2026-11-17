import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { init } from "../../src/commands/init.js";
import { bootstrap } from "../../src/commands/bootstrap.js";
import { lintRepo } from "../../src/commands/lint.js";
import { UsageError } from "../../src/change.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "openspec-matt-init-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("init", () => {
  it("needs openspec init first", () => {
    expect(() => init(root)).toThrow(UsageError);
  });

  it("installs schemas, config, docs/specs, CI and the bootstrap skill", () => {
    mkdirSync(join(root, "openspec"));
    mkdirSync(join(root, ".github"));
    writeFileSync(join(root, "CONTEXT.md"), "# X\n");
    const report = init(root);

    expect(existsSync(join(root, "openspec/schemas/matt/schema.yaml"))).toBe(true);
    expect(existsSync(join(root, "openspec/schemas/matt-lite/templates/tasks.md"))).toBe(true);
    expect(existsSync(join(root, "docs/specs"))).toBe(true);
    expect(existsSync(join(root, ".github/workflows/openspec-matt.yml"))).toBe(true);
    expect(existsSync(join(root, ".agents/skills/matt-bootstrap/SKILL.md"))).toBe(true);
    const config = parse(readFileSync(join(root, "openspec/config.yaml"), "utf8"));
    expect(config.schema).toBe("matt");
    expect(config.operations.archive.guidance).toEqual(expect.arrayContaining([expect.stringContaining("openspec-matt archive")]));
    expect(report.next.join("\n")).toContain("git mv CONTEXT.md GLOSSARY.md");
    expect(report.next.join("\n")).toContain("skills@1.9.0 add mattpocock/skills");
  });

  it("keeps existing config and context, and is idempotent", () => {
    mkdirSync(join(root, "openspec"));
    writeFileSync(
      join(root, "openspec/config.yaml"),
      "# team config\nschema: spec-driven\ncontext: |\n  Tech stack: Java 21.\nrules:\n  proposal:\n    - Keep it short\n",
    );
    init(root, { ci: "none" });
    init(root, { ci: "none" });
    const text = readFileSync(join(root, "openspec/config.yaml"), "utf8");
    const config = parse(text);
    expect(text).toContain("# team config");
    expect(config.schema).toBe("matt");
    expect(config.rules.proposal).toEqual(["Keep it short"]);
    expect(config.context).toContain("Tech stack: Java 21.");
    expect(config.context.match(/This project uses openspec-matt/g)).toHaveLength(1);
  });
});

describe("bootstrap and lintRepo", () => {
  it("creates empty specs that lint clean, and reports golden-file problems", () => {
    expect(bootstrap(root, ["checkout", "user-auth"])).toEqual(["docs/specs/checkout.md", "docs/specs/user-auth.md"]);
    expect(bootstrap(root, ["checkout"])).toEqual([]);
    expect(() => bootstrap(root, ["Bad_Name"])).toThrow(UsageError);
    expect(lintRepo(root)).toEqual([]);

    mkdirSync(join(root, "docs/adr"), { recursive: true });
    writeFileSync(join(root, "docs/adr/0001-a.md"), "# A\n");
    writeFileSync(join(root, "docs/adr/0001-b.md"), "# B\n");
    writeFileSync(join(root, "docs/specs/checkout.md"), "# Checkout\n");
    const codes = lintRepo(root).map((f) => `${f.file}:${f.code}`);
    expect(codes).toContain("docs/adr/0001-b.md:adr-duplicate-number");
    expect(codes).toContain("docs/specs/checkout.md:missing-section");
  });
});
