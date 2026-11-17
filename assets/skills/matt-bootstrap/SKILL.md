---
name: matt-bootstrap
description: Draft the first living specs (docs/specs/<capability>.md) for an existing codebase from its code, tests, docs, GLOSSARY.md and ADRs. Use once, when adopting openspec-matt in a repo that has no living specs yet.
---

# Bootstrap living specs

Living specs describe what the system does now, one file per capability, for business readers and new developers. This skill writes the first drafts; a human reviews them in one MR.

1. **Find the capabilities.** Read the README and other docs, the code's top-level structure, the tests, `GLOSSARY.md` and `docs/adr/`. Propose a list of kebab-case capabilities named after durable behaviour (`checkout`, `user-auth`), not code modules. Aim for 3–10.
   - A concern that cuts across the rest (configuration, permissions, reporting) can be its own capability.
   - Every behaviour belongs to exactly one capability; put a leftover where a reader would look for it first.

   Show the list and wait for the user to confirm or edit it.
2. **Create the files:** `npx openspec-matt bootstrap <capability...>` creates empty specs with every section.
3. **Fill each spec, one file at a time.** Say which capability you are on.
   - **Description:** one or two sentences on what the capability is for, on the line under the `#` title.
   - **Problem Statement / Solution:** why the capability exists and how it works, in broad strokes.
   - **User Stories:** one `### Story: <name>` per observable behaviour the code and tests actually show. Each has `As a <actor>, I want <feature>, so that <benefit>.`, a `The system SHALL …` line, and at least one `#### Scenario:` with **WHEN** / **THEN** steps.
     - Describe what the code does today, not what it should do. When docs or an old spec disagree with the code, the code wins; note the disagreement in Further Notes.
     - Use actors from `GLOSSARY.md`. If none fits, use a plain role (a developer, a CI pipeline) and suggest adding it to the glossary.
     - Names users type or configure (config keys, annotations, CLI flags) are fine. File paths and internal class names are not.
   - **Implementation Decisions / Testing Decisions:** high level, no file paths or code. A decision that has an ADR appears only here, as `- <decision>. See ADR-NNNN`; stories don't link ADRs.
   - **Out of Scope:** only what the code or ADRs clearly exclude.
   - **Further Notes:** anything you could not confirm, one line each, starting `Unsure:`.
   - Use the terms in `GLOSSARY.md`.
4. **Existing per-change specs** in `docs/specs/` (for example `0001-some-feature.md`) are input, not output, and they fail lint. Fold what they say about current behaviour into the capability specs. Drop stories about process or documentation, and anything later ADRs reversed. Ask the user before deleting the old files; they must be gone before step 5 can pass.
5. **Check:** `npx openspec-matt lint` must pass.
6. Tell the user to review the drafts in one MR. After that, specs change only through OpenSpec changes or deliberate hand edits.
