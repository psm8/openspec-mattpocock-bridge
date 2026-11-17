import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { init } from "../../src/commands/init.js";
import { recordBase } from "../../src/commands/base.js";
import { commitChange, mergeChange } from "../../src/commands/archive.js";
import { lintRepo } from "../../src/commands/lint.js";

const env = { ...process.env, OPENSPEC_TELEMETRY: "0", NO_COLOR: "1" };
const hasOpenspec = spawnSync("openspec", ["--version"], { env, shell: process.platform === "win32" }).status === 0;

let root: string;
const run = (cmd: string, ...args: string[]) =>
  execFileSync(cmd, args, { cwd: root, env, encoding: "utf8", shell: process.platform === "win32" && cmd === "openspec" });
const write = (rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

const LIVING = `# Checkout

Turning a cart into a paid order.

## Problem Statement
Customers need to pay for their cart.

## Solution
One checkout flow.

## User Stories

### Story: Guest checkout
As a guest, I want to pay without an account, so that I can buy quickly.
The system SHALL create the order without an account.

#### Scenario: guest pays by card
- **WHEN** a guest pays by card
- **THEN** the order is created without an account

## Implementation Decisions

## Testing Decisions

## Out of Scope

## Further Notes
`;

describe.skipIf(!hasOpenspec)("with the real OpenSpec CLI", () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "openspec-matt-e2e-"));
    run("git", "init", "-q", "-b", "main");
    run("git", "config", "user.email", "e2e@example.com");
    run("git", "config", "user.name", "E2E");
    run("git", "config", "commit.gpgsign", "false");
    mkdirSync(join(root, "openspec/changes"), { recursive: true });
    init(root, { ci: "none" });
    write("docs/specs/checkout.md", LIVING);
    run("git", "add", ".");
    run("git", "commit", "-qm", "init");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("validates both schemas", () => {
    expect(run("openspec", "schema", "validate", "matt")).toContain("is valid");
    expect(run("openspec", "schema", "validate", "matt-lite")).toContain("is valid");
  });

  it("runs a change from new to archived golden files", () => {
    run("openspec", "new", "change", "add-receipts");
    expect(readFileSync(join(root, "openspec/changes/add-receipts/.openspec.yaml"), "utf8")).toContain("schema: matt");

    const c = "openspec/changes/add-receipts";
    write(`${c}/proposal.md`, "# Proposal\n\n## Why\nCustomers want proof of payment.\n\n## What Changes\n- Email receipts.\n\n## Capabilities\n\n### New Capabilities\n- `receipts`: receipts\n\n### Modified Capabilities\n- `checkout`: emails a receipt\n\n## Impact\nMailer.\n");
    write(`${c}/specs/checkout/spec.md`, `## MODIFIED Requirements

### Requirement: Guest checkout
As a guest, I want to pay without an account, so that I can buy quickly.
The system SHALL create the order without an account and SHALL email a receipt.

#### Scenario: guest pays by card
- **WHEN** a guest pays by card
- **THEN** the order is created and a receipt is emailed
`);
    write(`${c}/specs/receipts/spec.md`, `## Purpose

Receipts give customers durable proof of what they paid and when.

## ADDED Requirements

### Requirement: Receipt PDF
As a customer, I want a PDF receipt, so that I can file it.
The system SHALL attach a PDF receipt to the receipt email.

#### Scenario: paid order
- **WHEN** an order is paid
- **THEN** the email carries a PDF receipt
`);
    write(`${c}/design.md`, "# Design\n\n## Implementation Decisions\n- Receipts are sent from a queue.\n");
    write(`${c}/tasks.md`, "- [x] #12 Email receipts\n");

    expect(run("openspec", "validate", "add-receipts", "--strict")).toContain("is valid");
    expect(run("openspec", "status", "--change", "add-receipts")).toContain("4/4 artifacts complete");

    // OpenSpec silently drops guidance that isn't a list of strings; prove the stock skill receives ours.
    const archiveInputs = JSON.parse(run("openspec", "instructions", "archive", "--change", "add-receipts", "--json"));
    expect(archiveInputs.operationGuidance.join("\n")).toContain("Archive without syncing");
    const proposalInputs = JSON.parse(run("openspec", "instructions", "proposal", "--change", "add-receipts", "--json"));
    expect(proposalInputs.instruction).toContain("GRILL FIRST");

    recordBase(root, "add-receipts");
    expect(run("openspec", "validate", "add-receipts", "--strict")).toContain("is valid");

    const merged = mergeChange(root, "add-receipts");
    expect(merged.conflicts).toEqual([]);
    expect(lintRepo(root).filter((f) => f.severity === "error")).toEqual([]);
    expect(readFileSync(join(root, "docs/specs/receipts.md"), "utf8")).toContain(
      "# Receipts\n\nReceipts give customers durable proof",
    );

    commitChange(root, "add-receipts");
    expect(existsSync(join(root, c))).toBe(false);
    // OpenSpec creates these folders itself; they must stay empty.
    expect(run("git", "ls-files", "openspec/changes/archive", "openspec/specs")).toBe("");
    expect(run("git", "status", "--porcelain")).toBe("");
  });
});
