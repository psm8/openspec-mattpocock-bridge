import { createHash } from "node:crypto";

/** Fingerprint of a story body that ignores line endings and trailing whitespace. */
export function hashStory(body: string): string {
  const normalized = body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
