import { describe, expect, it } from "vitest";
import { parseLivingSpec, renderLivingSpec } from "../../src/spec/parse.js";
import { lintLivingSpec } from "../../src/spec/lint.js";

const valid = `# Checkout

Turning a cart into a paid order.

## Problem Statement
Customers need to pay for what is in their cart.

## Solution
A single checkout flow.

## User Stories

### Story: Guest checkout
As a guest, I want to pay without an account, so that I can buy quickly.
The system SHALL create the order without an account.

#### Scenario: guest pays by card
- WHEN a guest pays by card
- THEN the order is created

### Story: Saved cards
As a customer, I want my card remembered, so that I pay faster.
The system SHALL offer saved cards.

#### Scenario: returning customer
- WHEN a returning customer checks out
- THEN their saved card is offered

## Implementation Decisions
- Payments go through one adapter. See ADR-0007

## Testing Decisions
Tested at the HTTP seam.

## Out of Scope
- Gift cards

## Further Notes
None.
`;

const codes = (text: string) => lintLivingSpec(text).map((f) => f.code);

describe("parseLivingSpec", () => {
  it("finds the title and stories in order", () => {
    const spec = parseLivingSpec(valid);
    expect(spec.title).toBe("Checkout");
    expect(spec.stories.map((s) => s.name)).toEqual(["Guest checkout", "Saved cards"]);
  });

  it("keeps the story body without its heading", () => {
    const story = parseLivingSpec(valid).stories[0]!;
    expect(story.body).toContain("The system SHALL create the order");
    expect(story.body).not.toContain("### Story");
  });

  it("round-trips untouched text exactly", () => {
    expect(renderLivingSpec(parseLivingSpec(valid))).toBe(valid);
  });

  it("ignores headings inside code fences", () => {
    const text = valid.replace(
      "Tested at the HTTP seam.",
      "Tested at the HTTP seam.\n\n```md\n### Story: Not real\n## Not a section\n```",
    );
    expect(parseLivingSpec(text).stories).toHaveLength(2);
    expect(codes(text)).toEqual([]);
  });
});

describe("lintLivingSpec", () => {
  it("accepts a valid spec", () => {
    expect(lintLivingSpec(valid)).toEqual([]);
  });

  it("requires the title", () => {
    expect(codes(valid.replace("# Checkout\n", ""))).toContain("missing-title");
  });

  it("requires every section once, in order", () => {
    expect(codes(valid.replace("## Testing Decisions\n", ""))).toContain("missing-section");
    const swapped = valid
      .replace("## Problem Statement", "## TMP")
      .replace("## Solution", "## Problem Statement")
      .replace("## TMP", "## Solution");
    expect(codes(swapped)).toContain("section-order");
    expect(codes(valid.replace("## Further Notes", "## Extras"))).toContain("unknown-section");
  });

  it("rejects duplicate story names, case-insensitively", () => {
    expect(codes(valid.replace("### Story: Saved cards", "### Story: guest checkout"))).toContain(
      "duplicate-story",
    );
  });

  it("requires a story sentence, a SHALL line and a scenario", () => {
    expect(codes(valid.replace("As a guest, I want", "Guests want"))).toContain("story-sentence");
    expect(codes(valid.replace("The system SHALL create", "The system creates"))).toContain(
      "story-shall",
    );
    expect(codes(valid.replace("#### Scenario: guest pays by card", "Example:"))).toContain(
      "story-scenario",
    );
  });

  it("rejects stories outside User Stories and loose text inside it", () => {
    expect(codes(valid.replace("Tested at the HTTP seam.", "### Story: Stray\nx"))).toContain(
      "story-outside-user-stories",
    );
    expect(codes(valid.replace("## User Stories\n", "## User Stories\nIntro text.\n"))).toContain(
      "loose-text-in-user-stories",
    );
  });

  it("reports line numbers", () => {
    const [finding] = lintLivingSpec(valid.replace("### Story: Saved cards", "### Story: Guest checkout"));
    expect(finding!.line).toBe(valid.split("\n").indexOf("### Story: Saved cards") + 1);
  });
});
