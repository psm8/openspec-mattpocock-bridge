import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { parseDelta, type Delta } from "./delta/parse.js";
import type { BaseMap } from "./merge/merge.js";

export const SPECS_DIR = "docs/specs";

export class UsageError extends Error {}

/** Walks up from `start` to the directory that holds `openspec/`. */
export function findRoot(start = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "openspec"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new UsageError("no openspec/ directory found here or above; run 'openspec init' first");
    dir = parent;
  }
}

export interface Change {
  root: string;
  name: string;
  dir: string;
  /** Repo-relative, forward slashes. */
  relDir: string;
}

/**
 * Finds a change by name, either still active in `openspec/changes/<name>` or already moved by the
 * stock archive skill to `openspec/changes/archive/YYYY-MM-DD-<name>`.
 */
export function openChange(root: string, name: string): Change {
  if (!name || name === "archive" || name.includes("/") || name.includes("\\")) {
    throw new UsageError(`'${name}' is not a change name`);
  }
  const active = `openspec/changes/${name}`;
  if (existsSync(join(root, active))) return { root, name, dir: join(root, active), relDir: active };

  const archiveDir = join(root, "openspec/changes/archive");
  const archived = existsSync(archiveDir)
    ? readdirSync(archiveDir).filter((entry) => entry === name || entry.replace(/^\d{4}-\d{2}-\d{2}-/, "") === name)
    : [];
  if (archived.length > 1) {
    throw new UsageError(`'${name}' matches several archived changes (${archived.join(", ")}); pass the full folder name`);
  }
  if (archived.length === 1) {
    const relDir = `openspec/changes/archive/${archived[0]}`;
    return { root, name, dir: join(root, relDir), relDir };
  }
  throw new UsageError(`no change '${name}' in openspec/changes/ or openspec/changes/archive/`);
}

export interface CapabilityDelta {
  capability: string;
  delta: Delta;
}

export function readDeltas(change: Change): CapabilityDelta[] {
  const specsDir = join(change.dir, "specs");
  if (!existsSync(specsDir)) return [];
  return readdirSync(specsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(specsDir, entry.name, "spec.md")))
    .map((entry) => ({
      capability: entry.name,
      delta: parseDelta(readFileSync(join(specsDir, entry.name, "spec.md"), "utf8")),
    }))
    .sort((a, b) => a.capability.localeCompare(b.capability));
}

export function livingSpecPath(root: string, capability: string): string {
  return join(root, SPECS_DIR, `${capability}.md`);
}

export function readLivingSpec(root: string, capability: string): string | undefined {
  const path = livingSpecPath(root, capability);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/** `.openspec.yaml` with comment-preserving edits for our x- keys. */
export class ChangeMeta {
  private readonly path: string;
  private readonly doc;

  constructor(change: Change) {
    this.path = join(change.dir, ".openspec.yaml");
    this.doc = parseDocument(existsSync(this.path) ? readFileSync(this.path, "utf8") : "");
    if (this.doc.contents === null) this.doc.contents = this.doc.createNode({}) as never;
  }

  get schema(): string | undefined {
    return this.doc.get("schema") as string | undefined;
  }

  base(capability: string): BaseMap {
    const all = this.doc.toJS()?.["x-base"] as Record<string, BaseMap> | undefined;
    return all?.[capability] ?? {};
  }

  setBase(base: Record<string, BaseMap>): void {
    this.doc.set("x-base", base);
  }

  get merged(): boolean {
    return this.doc.get("x-merged") === true;
  }

  set merged(value: boolean) {
    this.doc.set("x-merged", value);
  }

  save(): void {
    writeFileSync(this.path, this.doc.toString());
  }
}
