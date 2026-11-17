export interface Heading {
  level: number;
  text: string;
  line: number; // 0-based index into the lines array
}

export function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

/** ATX headings outside fenced code blocks. */
export function headings(lines: string[]): Heading[] {
  const found: Heading[] = [];
  let fence: string | undefined;
  lines.forEach((line, index) => {
    const marker = /^\s*(```|~~~)/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (fence === marker) fence = undefined;
      return;
    }
    if (fence) return;
    const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (match) found.push({ level: match[1]!.length, text: match[2]!, line: index });
  });
  return found;
}

export function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
