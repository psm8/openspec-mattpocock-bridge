export interface Finding {
  severity: "error" | "warning";
  code: string;
  file: string;
  line: number;
  message: string;
}

export function formatFinding(f: Finding): string {
  const where = f.file ? `${f.file}:${f.line}` : `line ${f.line}`;
  return `${f.severity === "error" ? "error" : "warn "} ${where} [${f.code}] ${f.message}`;
}
