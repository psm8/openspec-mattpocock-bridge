import type { Finding } from "./finding.js";

export const ADR_WARN_BYTES = 3 * 1024;
const ADR_NAME = /^(\d{4})-[a-z0-9][a-z0-9-]*\.md$/;

export interface AdrFile {
  name: string;
  size: number;
}

export function lintAdrs(files: AdrFile[], dir = "docs/adr"): Finding[] {
  const findings: Finding[] = [];
  const byNumber = new Map<string, string>();
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${dir}/${file.name}`;
    const number = ADR_NAME.exec(file.name)?.[1];
    if (!number) {
      findings.push({ severity: "error", code: "adr-name", file: path, line: 1, message: "ADR files are named NNNN-kebab-slug.md" });
      continue;
    }
    const clash = byNumber.get(number);
    if (clash) {
      findings.push({ severity: "error", code: "adr-duplicate-number", file: path, line: 1, message: `ADR number ${number} is also used by ${clash}; renumber to the next free number` });
    } else {
      byNumber.set(number, file.name);
    }
    if (file.size > ADR_WARN_BYTES) {
      findings.push({ severity: "warning", code: "adr-size", file: path, line: 1, message: `ADR is ${file.size} bytes; aim for 1-3 sentences (warn above ${ADR_WARN_BYTES})` });
    }
  }
  return findings;
}
