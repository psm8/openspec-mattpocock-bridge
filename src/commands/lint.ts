import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SPECS_DIR } from "../change.js";
import { lintAdrs } from "../lint/adr.js";
import type { Finding } from "../lint/finding.js";
import { lintGlossary } from "../lint/glossary.js";
import { lintLivingSpec } from "../spec/lint.js";

/** Lints every golden file under `root`: living specs, ADR numbering/size and the glossary. */
export function lintRepo(root: string): Finding[] {
  const findings: Finding[] = [];

  const specs = join(root, SPECS_DIR);
  if (existsSync(specs)) {
    for (const name of readdirSync(specs).filter((n) => n.endsWith(".md")).sort()) {
      findings.push(...lintLivingSpec(readFileSync(join(specs, name), "utf8"), `${SPECS_DIR}/${name}`));
    }
  }

  const adrs = join(root, "docs/adr");
  if (existsSync(adrs)) {
    const files = readdirSync(adrs)
      .filter((n) => n.endsWith(".md") && n.toLowerCase() !== "readme.md")
      // Measure LF-normalised bytes so a CRLF checkout reports the same size as the repo.
      .map((name) => ({ name, size: Buffer.byteLength(readFileSync(join(adrs, name), "utf8").replace(/\r\n/g, "\n")) }));
    findings.push(...lintAdrs(files));
  }

  for (const glossary of ["GLOSSARY.md", "CONTEXT.md"]) {
    const path = join(root, glossary);
    if (existsSync(path)) findings.push(...lintGlossary(readFileSync(path, "utf8"), glossary));
  }

  findings.push(...lintLeftovers(root));
  return findings;
}

/**
 * The stock archive skill moves a change into openspec/changes/archive/ (and may sync into
 * openspec/specs/). Both must be emptied by `openspec-matt archive --commit`.
 */
function lintLeftovers(root: string): Finding[] {
  const findings: Finding[] = [];
  const entries = (rel: string) =>
    existsSync(join(root, rel)) ? readdirSync(join(root, rel)).filter((e) => e !== ".gitkeep").sort() : [];

  for (const entry of entries("openspec/changes/archive")) {
    const name = entry.replace(/^\d{4}-\d{2}-\d{2}-/, "");
    const meta = join(root, "openspec/changes/archive", entry, ".openspec.yaml");
    const merged = existsSync(meta) && /^x-merged:\s*true\s*$/m.test(readFileSync(meta, "utf8"));
    findings.push(
      merged
        ? {
            severity: "warning",
            code: "pending-archive-commit",
            file: `openspec/changes/archive/${entry}`,
            line: 1,
            message: `merged into docs/specs but not committed yet; run 'openspec-matt archive ${name} --commit'`,
          }
        : {
            severity: "error",
            code: "unconverted-archive",
            file: `openspec/changes/archive/${entry}`,
            line: 1,
            message: `archived change was never turned into golden files; run 'openspec-matt archive ${name}' then '--commit'`,
          },
    );
  }
  for (const entry of entries("openspec/specs")) {
    findings.push({
      severity: "error",
      code: "openspec-specs-used",
      file: `openspec/specs/${entry}`,
      line: 1,
      message: "openspec/specs/ stays empty here; living specs are docs/specs/<capability>.md",
    });
  }
  return findings;
}
