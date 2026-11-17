# The spec is a living per-capability document, unlike Matt's disposable snapshot

Matt's skills treat a spec as a snapshot that is thrown away once the work ships, and rely on `GLOSSARY.md` and ADRs as what lasts. We keep `docs/specs/<capability>.md` as a living document instead, because after hundreds of tickets a team still needs one readable description of current behaviour for business and new developers, and developers often edit it by hand when they skip OpenSpec. The cost is that we own the spec format, a deterministic story merge with base-hash conflict stops, and a CI lint.
