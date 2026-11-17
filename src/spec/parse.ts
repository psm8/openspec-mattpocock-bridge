import { headings, splitLines } from "../markdown.js";

export const SECTIONS = [
  "Problem Statement",
  "Solution",
  "User Stories",
  "Implementation Decisions",
  "Testing Decisions",
  "Out of Scope",
  "Further Notes",
] as const;

export const STORY_PREFIX = "Story:";

export interface Story {
  name: string;
  /** Text under the heading, trimmed. */
  body: string;
  /** 1-based line of the heading in the parsed text; 0 for stories added by a merge. */
  line: number;
  /** Original text of the whole block; dropped when the story is changed so it is re-rendered. */
  raw?: string;
}

export interface LivingSpec {
  title?: string;
  /** Everything up to the first story (or up to the end of User Stories when there are none). */
  before: string;
  stories: Story[];
  /** Everything after the last story. */
  after: string;
  hasUserStories: boolean;
}

export function storyName(headingText: string): string | undefined {
  return headingText.startsWith(STORY_PREFIX) ? headingText.slice(STORY_PREFIX.length).trim() : undefined;
}

export function parseLivingSpec(text: string): LivingSpec {
  const lines = splitLines(text);
  const all = headings(lines);
  const title = all.find((h) => h.level === 1)?.text;
  const userStories = all.find((h) => h.level === 2 && h.text === "User Stories");

  if (!userStories) {
    return { title, before: lines.join("\n"), stories: [], after: "", hasUserStories: false };
  }

  const sectionEnd = all.find((h) => h.level <= 2 && h.line > userStories.line)?.line ?? lines.length;
  const storyHeadings = all.filter(
    (h) => h.level === 3 && h.line > userStories.line && h.line < sectionEnd && storyName(h.text) !== undefined,
  );

  const firstStory = storyHeadings[0]?.line ?? sectionEnd;
  const stories = storyHeadings.map((h, i) => {
    const end = storyHeadings[i + 1]?.line ?? sectionEnd;
    const block = lines.slice(h.line, end);
    return {
      name: storyName(h.text)!,
      body: block.slice(1).join("\n").trim(),
      line: h.line + 1,
      raw: block.join("\n") + "\n",
    };
  });

  return {
    title,
    before: lines.slice(0, firstStory).join("\n") + (firstStory < lines.length ? "\n" : ""),
    stories,
    after: lines.slice(sectionEnd).join("\n"),
    hasUserStories: true,
  };
}

export function renderStory(story: Story): string {
  return story.raw ?? `### ${STORY_PREFIX} ${story.name}\n${story.body.trim()}\n\n`;
}

export function renderLivingSpec(spec: LivingSpec): string {
  let stories = spec.stories.map(renderStory).join("");
  if (stories && !spec.before.endsWith("\n\n") && !spec.before.endsWith("\n")) stories = "\n" + stories;
  if (stories && spec.after && !stories.endsWith("\n\n")) stories += "\n";
  return spec.before + stories + spec.after;
}
