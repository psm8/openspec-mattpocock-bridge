import { headings, splitLines } from "../markdown.js";

export interface DeltaRequirement {
  name: string;
  body: string;
}

export interface Delta {
  /** `## Purpose` text; OpenSpec only uses it when the delta creates a new capability. */
  purpose?: string;
  added: DeltaRequirement[];
  modified: DeltaRequirement[];
  removed: string[];
  renamed: { from: string; to: string }[];
}

const REQUIREMENT = /^Requirement:\s*(.+)$/;
const RENAME_LINE = /^\s*-?\s*(FROM|TO):\s*`?\s*(?:###\s*)?Requirement:\s*(.+?)\s*`?\s*$/i;

/** Reads an OpenSpec delta spec (the same headings OpenSpec's own parser accepts). */
export function parseDelta(text: string): Delta {
  const lines = splitLines(text);
  const all = headings(lines);
  const delta: Delta = { added: [], modified: [], removed: [], renamed: [] };

  const sections = all.filter((h) => h.level === 2);
  sections.forEach((section, i) => {
    if (/^Purpose$/i.test(section.text)) {
      const end = sections[i + 1]?.line ?? lines.length;
      const purpose = lines.slice(section.line + 1, end).join("\n").trim();
      if (purpose) delta.purpose = purpose;
      return;
    }
    const op = /^(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements$/i.exec(section.text)?.[1]?.toUpperCase();
    if (!op) return;
    const end = sections[i + 1]?.line ?? lines.length;

    if (op === "RENAMED") {
      let from: string | undefined;
      for (const line of lines.slice(section.line + 1, end)) {
        const m = RENAME_LINE.exec(line);
        if (!m) continue;
        if (m[1]!.toUpperCase() === "FROM") from = m[2]!;
        else if (from) {
          delta.renamed.push({ from, to: m[2]! });
          from = undefined;
        }
      }
      return;
    }

    const blocks = all.filter((h) => h.level === 3 && h.line > section.line && h.line < end && REQUIREMENT.test(h.text));
    blocks.forEach((block, j) => {
      const name = REQUIREMENT.exec(block.text)![1]!.trim();
      const blockEnd = blocks[j + 1]?.line ?? end;
      const body = lines.slice(block.line + 1, blockEnd).join("\n").trim();
      if (op === "ADDED") delta.added.push({ name, body });
      else if (op === "MODIFIED") delta.modified.push({ name, body });
      else delta.removed.push(name);
    });
  });

  return delta;
}
