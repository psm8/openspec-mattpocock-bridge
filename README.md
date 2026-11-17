# openspec-matt

Use [OpenSpec](https://github.com/Fission-AI/OpenSpec) 2.0's stock workflow with [Matt Pocock's skills](https://github.com/mattpocock/skills) doing the work, and keep only a few golden files in git.

- **You type the usual commands:** `/openspec-propose`, `/openspec-apply-change`, `/openspec-archive-change`.
- **Matt's skills run inside them:**
  - `grilling` and `domain-modeling` come first;
  - `to-tickets` publishes the work to your tracker;
  - `tdd` and `code-review` run per ticket.
- **Archive turns the change into golden files and deletes the rest:**
  - `docs/specs/<capability>.md`: a living spec per capability, readable by business and new developers;
  - `GLOSSARY.md` and `docs/adr/`: written during grilling;
  - tickets in your tracker (GitHub, GitLab or local markdown, whichever Matt's setup configured).

Requires Node ≥ 22.12 and OpenSpec 2.x.

## Install

```sh
openspec init                        # OpenSpec's skills for your agent
npx openspec-matt init --install-matt
```

`init` does five things:
- copies the `matt` and `matt-lite` schemas into `openspec/schemas/`;
- sets `openspec/config.yaml` (default schema, context, archive guidance);
- creates `docs/specs/`;
- adds a CI lint job;
- installs Matt's skills, pinned in `skills-lock.json`.

Then run Matt's `/setup-matt-pocock-skills` to pick your issue tracker.

Have an existing codebase with no specs? Ask your agent to run the `matt-bootstrap` skill. It drafts `docs/specs/` from the code, tests, glossary and ADRs, for review in one MR.

## How a change flows

1. **`/openspec-propose <idea>`.**
   - The agent grills you until you share an understanding, writing `GLOSSARY.md` and ADRs as terms and decisions settle.
   - It then writes the change folder: `proposal.md`, story deltas under `specs/`, `design.md`.
   - You review in the session and say "go". The work becomes tickets in your tracker, and `tasks.md` becomes one link per ticket.
2. **`/openspec-apply-change`.** Ticket by ticket, test-first, ticking `tasks.md`.
3. **`/openspec-archive-change`.** It runs as usual. You choose *Archive without syncing*, because `openspec/specs/` stays empty, and the change moves to `openspec/changes/archive/`. The archive guidance in `config.yaml` then has the agent run `openspec-matt archive`, which:
   - merges the story deltas into `docs/specs/`;
   - has the agent update the spec's prose sections and re-check new ADRs;
   - commits the archived change once, then deletes it.

   CI lint fails while an archived change is left unconverted.
4. **Squash-merge**, with the proposal's *Why* as the commit body. History is `git log docs/specs GLOSSARY.md docs/adr`.

For a small change, ask for `matt-lite`. It has the same grilling, no `design.md`, and exactly one ticket.

You can also edit `docs/specs/` by hand when you skip OpenSpec. CI lint keeps the format mergeable. Archive refuses to overwrite a story someone edited after the change was proposed: it fingerprints each touched story at propose time (`openspec-matt base`).

## CLI

| Command | What it does |
|---|---|
| `openspec-matt init [--ci github\|gitlab\|none] [--install-matt]` | Set up a repo that already has `openspec/` |
| `openspec-matt base <change>` | Fingerprint the stories a change's deltas touch |
| `openspec-matt archive <change>` | Merge the change's story deltas into `docs/specs/` (all or nothing) |
| `openspec-matt archive <change> --commit` | Commit the change with the golden files, then delete it |
| `openspec-matt lint` | Fail on spec format, duplicate ADR numbers or duplicate story names; warn on long ADRs and glossary entries |
| `openspec-matt bootstrap <capability...>` | Create empty living specs for `matt-bootstrap` to fill |

## Living spec format

```markdown
# Checkout

Turning a cart into a paid order.

## Problem Statement
## Solution
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
```

In a change, the same block is written as `### Requirement: Guest checkout` under `## ADDED|MODIFIED|REMOVED|RENAMED Requirements`, so `openspec validate --strict` still applies. Why the spec is living, when Matt treats it as a disposable snapshot: [ADR-0001](docs/adr/0001-living-spec-diverges-from-matt.md).

## Development

```sh
npm install
npm test           # unit tests
npm run test:e2e   # needs the openspec CLI on PATH
npm run build
```

## License

Apache-2.0
