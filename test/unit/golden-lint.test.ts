import { describe, expect, it } from "vitest";
import { lintAdrs } from "../../src/lint/adr.js";
import { lintGlossary } from "../../src/lint/glossary.js";

describe("lintAdrs", () => {
  it("accepts unique, well-named ADRs", () => {
    expect(lintAdrs([{ name: "0001-a.md", size: 200 }, { name: "0002-b.md", size: 300 }])).toEqual([]);
  });

  it("fails on duplicate numbers", () => {
    const findings = lintAdrs([{ name: "0003-a.md", size: 1 }, { name: "0003-b.md", size: 1 }]);
    expect(findings).toMatchObject([{ severity: "error", code: "adr-duplicate-number" }]);
  });

  it("fails on a bad file name", () => {
    expect(lintAdrs([{ name: "adr-one.md", size: 1 }])).toMatchObject([{ severity: "error", code: "adr-name" }]);
  });

  it("warns above 3 KB", () => {
    expect(lintAdrs([{ name: "0001-a.md", size: 3073 }])).toMatchObject([{ severity: "warning", code: "adr-size" }]);
  });
});

describe("lintGlossary", () => {
  it("accepts one- and two-sentence definitions", () => {
    const text = "# X\n\n## Language\n\n**Order**:\nA request to buy. It has lines.\n_Avoid_: purchase\n\n**Cart**: Items not yet ordered.\n";
    expect(lintGlossary(text)).toEqual([]);
  });

  it("warns on definitions longer than two sentences", () => {
    const text = "## Language\n\n**Order**:\nA request. It has lines. It can be cancelled.\n_Avoid_: purchase\n";
    expect(lintGlossary(text)).toMatchObject([{ severity: "warning", code: "glossary-length", line: 3 }]);
  });

  it("does not count abbreviations or decimals as sentence ends", () => {
    const text = "**Fee**:\nA charge, e.g. a 2.5 percent card fee. It is shown at checkout.\n";
    expect(lintGlossary(text)).toEqual([]);
  });
});
