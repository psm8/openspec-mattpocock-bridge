import { splitLines } from "../markdown.js";
import type { Finding } from "./finding.js";

const TERM = /^\*\*(.+?)\*\*:\s*(.*)$/;

export function lintGlossary(text: string, file = "GLOSSARY.md"): Finding[] {
  const lines = splitLines(text);
  const findings: Finding[] = [];
  lines.forEach((line, index) => {
    const match = TERM.exec(line);
    if (!match) return;
    const definition = [match[2]!];
    for (let i = index + 1; i < lines.length; i++) {
      const next = lines[i]!;
      if (next.trim() === "" || next.startsWith("_Avoid_") || next.startsWith("#") || TERM.test(next)) break;
      definition.push(next);
    }
    const sentences = countSentences(definition.join(" "));
    if (sentences > 2) {
      findings.push({
        severity: "warning",
        code: "glossary-length",
        file,
        line: index + 1,
        message: `'${match[1]}' has ${sentences} sentences; keep definitions to 1-2`,
      });
    }
  });
  return findings;
}

function countSentences(text: string): number {
  const cleaned = text
    .replace(/\b(e\.g|i\.e|etc|vs|cf)\./gi, "$1")
    .replace(/(\d)\.(\d)/g, "$1$2")
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/[.!?]+(?:\s+|$)/).filter((s) => s.trim() !== "").length;
}
