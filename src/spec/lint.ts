import { headings, normalizeName, splitLines } from "../markdown.js";
import type { Finding } from "../lint/finding.js";
import { SECTIONS, storyName } from "./parse.js";

const STORY_SENTENCE = /^As an? .+, I want .+/m;
const SHALL = /\b(SHALL|MUST)\b/;

export function lintLivingSpec(text: string, file = ""): Finding[] {
  const lines = splitLines(text);
  const all = headings(lines);
  const findings: Finding[] = [];
  const error = (code: string, line: number, message: string) =>
    findings.push({ severity: "error", code, file, line, message });

  const h1 = all.filter((h) => h.level === 1);
  if (h1.length !== 1 || h1[0]!.line !== firstContentLine(lines)) {
    error("missing-title", h1[0] ? h1[0].line + 1 : 1, "a living spec starts with exactly one '# <Capability>' title");
  }

  const h2 = all.filter((h) => h.level === 2);
  for (const h of h2) {
    if (!(SECTIONS as readonly string[]).includes(h.text)) {
      error("unknown-section", h.line + 1, `unknown section '## ${h.text}'; allowed: ${SECTIONS.join(", ")}`);
    }
  }
  const known = h2.filter((h) => (SECTIONS as readonly string[]).includes(h.text));
  for (const section of SECTIONS) {
    const count = known.filter((h) => h.text === section).length;
    if (count === 0) error("missing-section", 1, `missing section '## ${section}'`);
    if (count > 1) error("duplicate-section", known.filter((h) => h.text === section)[1]!.line + 1, `section '## ${section}' appears more than once`);
  }
  const order = known.map((h) => SECTIONS.indexOf(h.text as (typeof SECTIONS)[number]));
  const outOfOrder = order.findIndex((value, i) => i > 0 && value < order[i - 1]!);
  if (outOfOrder > 0) error("section-order", known[outOfOrder]!.line + 1, `sections must follow the order: ${SECTIONS.join(", ")}`);

  const userStories = known.find((h) => h.text === "User Stories");
  const sectionEnd = userStories
    ? (all.find((h) => h.level <= 2 && h.line > userStories.line)?.line ?? lines.length)
    : -1;
  const inUserStories = (line: number) => userStories !== undefined && line > userStories.line && line < sectionEnd;

  const seen = new Map<string, number>();
  const storyHeadings = all.filter((h) => h.level === 3 && storyName(h.text) !== undefined);
  for (const h of storyHeadings) {
    if (!inUserStories(h.line)) {
      error("story-outside-user-stories", h.line + 1, "stories belong under '## User Stories'");
      continue;
    }
    const name = storyName(h.text)!;
    const key = normalizeName(name);
    if (!name) error("story-name", h.line + 1, "a story needs a name: '### Story: <name>'");
    else if (seen.has(key)) error("duplicate-story", h.line + 1, `story '${name}' already exists at line ${seen.get(key)}`);
    else seen.set(key, h.line + 1);

    const end = all.find((x) => x.level <= 3 && x.line > h.line)?.line ?? lines.length;
    const body = lines.slice(h.line + 1, end).join("\n");
    const scenarios = all.filter((x) => x.level === 4 && x.line > h.line && x.line < end && x.text.startsWith("Scenario:"));
    const beforeScenarios = lines.slice(h.line + 1, scenarios[0]?.line ?? end).join("\n");
    if (!STORY_SENTENCE.test(beforeScenarios)) error("story-sentence", h.line + 1, `story '${name}' needs 'As a <actor>, I want <feature>, so that <benefit>'`);
    if (!SHALL.test(beforeScenarios)) error("story-shall", h.line + 1, `story '${name}' needs a SHALL (or MUST) line`);
    if (scenarios.length === 0 && body) error("story-scenario", h.line + 1, `story '${name}' needs at least one '#### Scenario:'`);
    else if (scenarios.length === 0) error("story-scenario", h.line + 1, `story '${name}' is empty`);
  }

  if (userStories) {
    const firstStory = storyHeadings.find((h) => inUserStories(h.line))?.line ?? sectionEnd;
    const loose = lines.slice(userStories.line + 1, firstStory).findIndex((l) => l.trim() !== "");
    if (loose >= 0) error("loose-text-in-user-stories", userStories.line + 2 + loose, "only '### Story:' blocks may appear under '## User Stories'");
    const otherH3 = all.find((h) => inUserStories(h.line) && h.level === 3 && storyName(h.text) === undefined);
    if (otherH3) error("loose-text-in-user-stories", otherH3.line + 1, `'### ${otherH3.text}' is not a story; use '### Story: <name>'`);
  }

  return findings.sort((a, b) => a.line - b.line);
}

function firstContentLine(lines: string[]): number {
  const index = lines.findIndex((l) => l.trim() !== "");
  return index < 0 ? 0 : index;
}
