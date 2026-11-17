import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { SPECS_DIR, UsageError, livingSpecPath } from "../change.js";
import { emptyLivingSpec } from "../spec/template.js";
import { dirname } from "node:path";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Creates empty living specs for the named capabilities; the matt-bootstrap skill fills them. */
export function bootstrap(root: string, capabilities: string[]): string[] {
  if (capabilities.length === 0) {
    throw new UsageError("name the capabilities to create, e.g. 'openspec-matt bootstrap checkout user-auth'");
  }
  const bad = capabilities.filter((c) => !KEBAB.test(c));
  if (bad.length > 0) throw new UsageError(`capability names are kebab-case: ${bad.join(", ")}`);

  const created: string[] = [];
  for (const capability of capabilities) {
    const path = livingSpecPath(root, capability);
    if (existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, emptyLivingSpec(capability));
    created.push(`${SPECS_DIR}/${capability}.md`);
  }
  return created;
}
