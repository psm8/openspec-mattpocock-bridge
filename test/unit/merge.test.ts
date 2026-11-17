import { describe, expect, it } from "vitest";
import { parseDelta } from "../../src/delta/parse.js";
import { MergeConflict, mergeDelta, baseHashes } from "../../src/merge/merge.js";
import { hashStory } from "../../src/merge/hash.js";
import { parseLivingSpec } from "../../src/spec/parse.js";
import { lintLivingSpec } from "../../src/spec/lint.js";

const spec = `# Checkout

## Problem Statement
P.

## Solution
S.

## User Stories

### Story: Guest checkout
As a guest, I want to pay without an account, so that I can buy quickly.
The system SHALL create the order without an account.

#### Scenario: guest pays
- WHEN a guest pays THEN the order is created

### Story: Saved cards
As a customer, I want my card remembered, so that I pay faster.
The system SHALL offer saved cards.

#### Scenario: returning customer
- WHEN a customer returns THEN the card is offered

## Implementation Decisions

## Testing Decisions

## Out of Scope

## Further Notes
`;

const story = (name: string, extra = "") => `### Requirement: ${name}
As a shopper, I want ${name.toLowerCase()}, so that it works.
The system SHALL support ${name.toLowerCase()}.${extra}

#### Scenario: happy path
- WHEN used THEN it works
`;

const current = (name: string) => parseLivingSpec(spec).stories.find((s) => s.name === name)!;
const baseFor = (...names: string[]) => Object.fromEntries(names.map((n) => [n, hashStory(current(n).body)]));
const names = (text: string) => parseLivingSpec(text).stories.map((s) => s.name);

describe("parseDelta", () => {
  it("reads all four operations", () => {
    const delta = parseDelta(`## ADDED Requirements
${story("Wallets")}
## MODIFIED Requirements
${story("Guest checkout")}
## REMOVED Requirements
### Requirement: Saved cards
**Reason**: replaced by wallets

## RENAMED Requirements
- FROM: \`### Requirement: Old name\`
- TO: \`### Requirement: New name\`
`);
    expect(delta.added.map((r) => r.name)).toEqual(["Wallets"]);
    expect(delta.modified.map((r) => r.name)).toEqual(["Guest checkout"]);
    expect(delta.removed).toEqual(["Saved cards"]);
    expect(delta.renamed).toEqual([{ from: "Old name", to: "New name" }]);
    expect(delta.added[0]!.body).toContain("#### Scenario: happy path");
  });
});

describe("mergeDelta", () => {
  it("appends ADDED stories and keeps the spec valid", () => {
    const result = mergeDelta(spec, "checkout", parseDelta(`## ADDED Requirements\n${story("Wallets")}`), {});
    expect(names(result.text)).toEqual(["Guest checkout", "Saved cards", "Wallets"]);
    expect(lintLivingSpec(result.text)).toEqual([]);
    expect(result.text).toContain("### Story: Wallets\nAs a shopper");
    expect(result.text).toContain("then it works\n\n## Implementation Decisions".replace("then", "THEN"));
  });

  it("replaces MODIFIED stories in place", () => {
    const delta = parseDelta(`## MODIFIED Requirements\n${story("Guest checkout", "\nThe system SHALL email a receipt.")}`);
    const result = mergeDelta(spec, "checkout", delta, baseFor("Guest checkout"));
    expect(names(result.text)).toEqual(["Guest checkout", "Saved cards"]);
    expect(result.text).toContain("email a receipt");
    expect(result.text).not.toContain("without an account");
  });

  it("removes and renames stories", () => {
    const delta = parseDelta(`## REMOVED Requirements
### Requirement: Saved cards

## RENAMED Requirements
- FROM: \`### Requirement: Guest checkout\`
- TO: \`### Requirement: Checkout without account\`
`);
    const result = mergeDelta(spec, "checkout", delta, baseFor("Saved cards", "Guest checkout"));
    expect(names(result.text)).toEqual(["Checkout without account"]);
    expect(result.text).toContain("without an account");
  });

  it("modifies a story under its new name after a rename", () => {
    const delta = parseDelta(`## RENAMED Requirements
- FROM: \`### Requirement: Guest checkout\`
- TO: \`### Requirement: Quick checkout\`

## MODIFIED Requirements
${story("Quick checkout")}`);
    const result = mergeDelta(spec, "checkout", delta, baseFor("Guest checkout"));
    expect(names(result.text)).toEqual(["Quick checkout", "Saved cards"]);
  });

  it("leaves untouched stories byte-for-byte", () => {
    const result = mergeDelta(spec, "checkout", parseDelta(`## ADDED Requirements\n${story("Wallets")}`), {});
    expect(result.text.startsWith(spec.slice(0, spec.indexOf("## Implementation Decisions")))).toBe(true);
  });

  it("creates a new spec from the template for a new capability", () => {
    const result = mergeDelta(undefined, "gift-cards", parseDelta(`## ADDED Requirements\n${story("Redeem")}`), {});
    expect(result.text.startsWith("# Gift Cards\n")).toBe(true);
    expect(names(result.text)).toEqual(["Redeem"]);
    expect(lintLivingSpec(result.text)).toEqual([]);
  });

  it("uses a new capability's Purpose as the spec description", () => {
    const delta = parseDelta(`## Purpose

Gift cards let customers pay with prepaid credit.

## ADDED Requirements
${story("Redeem")}`);
    const result = mergeDelta(undefined, "gift-cards", delta, {});
    expect(
      result.text.startsWith("# Gift Cards\n\nGift cards let customers pay with prepaid credit.\n\n## Problem Statement"),
    ).toBe(true);
    expect(lintLivingSpec(result.text)).toEqual([]);
  });

  describe("hard stops", () => {
    const conflicts = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        if (e instanceof MergeConflict) return e.problems.map((p) => p.code);
        throw e;
      }
      return [];
    };

    it("stops when a story was edited by hand since propose", () => {
      const edited = spec.replace("without an account.", "without an account, fast.");
      const delta = parseDelta(`## MODIFIED Requirements\n${story("Guest checkout")}`);
      expect(conflicts(() => mergeDelta(edited, "checkout", delta, baseFor("Guest checkout")))).toEqual(["base-mismatch"]);
    });

    it("stops when no base was recorded", () => {
      const delta = parseDelta(`## REMOVED Requirements\n### Requirement: Saved cards\n`);
      expect(conflicts(() => mergeDelta(spec, "checkout", delta, {}))).toEqual(["no-base"]);
    });

    it("stops on unknown targets and duplicate ADDED, reporting all problems", () => {
      const delta = parseDelta(`## ADDED Requirements
${story("Saved cards")}
## MODIFIED Requirements
${story("Ghost")}
## REMOVED Requirements
### Requirement: Phantom
`);
      expect(conflicts(() => mergeDelta(spec, "checkout", delta, {}))).toEqual([
        "unknown-target",
        "unknown-target",
        "duplicate-added",
      ]);
    });

    it("stops when a rename targets an existing story name", () => {
      const delta = parseDelta(
        "## RENAMED Requirements\n- FROM: `### Requirement: Guest checkout`\n- TO: `### Requirement: Saved cards`\n",
      );
      expect(conflicts(() => mergeDelta(spec, "checkout", delta, baseFor("Guest checkout")))).toEqual(["rename-collision"]);
    });

    it("stops on MODIFIED for a capability with no spec", () => {
      const delta = parseDelta(`## MODIFIED Requirements\n${story("Ghost")}`);
      expect(conflicts(() => mergeDelta(undefined, "nope", delta, {}))).toEqual(["unknown-target"]);
    });

    it("ignores whitespace-only differences when comparing hashes", () => {
      const reflowed = spec.replace("without an account.\n", "without an account.   \n");
      const delta = parseDelta(`## MODIFIED Requirements\n${story("Guest checkout")}`);
      expect(conflicts(() => mergeDelta(reflowed, "checkout", delta, baseFor("Guest checkout")))).toEqual([]);
    });
  });
});

describe("baseHashes", () => {
  it("hashes every story the delta touches, using the pre-rename name", () => {
    const delta = parseDelta(`## MODIFIED Requirements
${story("Saved cards")}
## RENAMED Requirements
- FROM: \`### Requirement: Guest checkout\`
- TO: \`### Requirement: Quick\`

## ADDED Requirements
${story("Wallets")}`);
    expect(baseHashes(spec, delta)).toEqual(baseFor("Saved cards", "Guest checkout"));
  });
});
