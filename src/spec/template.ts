import { SECTIONS } from "./parse.js";

export function capabilityTitle(capability: string): string {
  return capability
    .split("-")
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

/** An empty living spec: the title, an optional description, and every section in order. */
export function emptyLivingSpec(capability: string, description?: string): string {
  const intro = description ? `${description.trim()}\n\n` : "";
  return `# ${capabilityTitle(capability)}\n\n${intro}` + SECTIONS.map((s) => `## ${s}\n`).join("\n");
}
