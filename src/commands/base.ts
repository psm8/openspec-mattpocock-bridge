import { ChangeMeta, openChange, readDeltas, readLivingSpec } from "../change.js";
import { baseHashes, type BaseMap } from "../merge/merge.js";

/** Records the hash of every living-spec story the change's deltas will touch. */
export function recordBase(root: string, name: string): Record<string, BaseMap> {
  const change = openChange(root, name);
  const all: Record<string, BaseMap> = {};
  for (const { capability, delta } of readDeltas(change)) {
    const base = baseHashes(readLivingSpec(root, capability), delta);
    if (Object.keys(base).length > 0) all[capability] = base;
  }
  const meta = new ChangeMeta(change);
  meta.setBase(all);
  meta.save();
  return all;
}
