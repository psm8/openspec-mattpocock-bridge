# openspec-matt

The language of a workflow that runs OpenSpec's stock commands and Matt Pocock's skills, and keeps only a few golden files in git.

## Language

### What lasts

**Golden file**:
A durable artifact kept in a single copy: a living spec, `GLOSSARY.md`, an ADR, or tracker ticket history. Everything else is disposable.
_Avoid_: source of truth (too vague), canonical doc

**Living spec**:
The current description of one capability, in `docs/specs/<capability>.md`, edited by every change that touches it.
_Avoid_: PRD, capability spec, snapshot spec

**Story**:
One addressable unit of behaviour in a living spec, headed `### Story: <name>`, with a story sentence, a SHALL line and at least one scenario.
_Avoid_: requirement (that is the OpenSpec delta's word for the same block)

**Capability**:
A kebab-case area of behaviour that owns exactly one living spec.
_Avoid_: feature, module

### What passes through

**Change**:
One unit of work, held as an OpenSpec change folder from propose until archive.
_Avoid_: feature branch, proposal

**Middle**:
The disposable OpenSpec artifacts of a change: proposal, deltas, design and tasks.
_Avoid_: draft, change docs

**Delta**:
A change's ADDED, MODIFIED, REMOVED or RENAMED stories for one capability, written in OpenSpec delta syntax.
_Avoid_: diff, patch

**Ticket**:
A vertical slice of a change that fits one context window, kept in the configured tracker.
_Avoid_: task (a task is only a line in `tasks.md` that links to a ticket)

**Base hash**:
The fingerprint of a story taken at propose, used at archive to detect a hand edit made in the meantime.
_Avoid_: checksum, version

**Archive**:
The step that moves a finished change aside (OpenSpec's own archive), merges its deltas into living specs, records the middle in one commit, then deletes it in a second.
_Avoid_: close, finish, sync (OpenSpec's sync writes `openspec/specs/`, which this workflow leaves empty)
