#!/usr/bin/env node
import { UsageError, findRoot } from "./change.js";
import { commitChange, mergeChange } from "./commands/archive.js";
import { recordBase } from "./commands/base.js";
import { bootstrap } from "./commands/bootstrap.js";
import { init } from "./commands/init.js";
import { lintRepo } from "./commands/lint.js";
import { formatFinding } from "./lint/finding.js";

const HELP = `openspec-matt - OpenSpec's stock workflow, archived into living specs, GLOSSARY.md and ADRs

Usage:
  openspec-matt init [--ci github|gitlab|none] [--install-matt]
  openspec-matt base <change>              record fingerprints of the stories a change touches
  openspec-matt archive <change>           merge the change's story deltas into docs/specs/
  openspec-matt archive <change> --commit  commit the change with the golden files, then delete it
  openspec-matt lint                       check docs/specs, docs/adr and GLOSSARY.md
  openspec-matt bootstrap <capability...>  create empty living specs for the matt-bootstrap skill to fill
`;

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const args = rest.filter((a, i) => !a.startsWith("--") && rest[i - 1] !== "--ci");

  switch (command) {
    case "init": {
      const ciIndex = rest.indexOf("--ci");
      const ci = ciIndex >= 0 ? rest[ciIndex + 1] : undefined;
      if (ci !== undefined && !["github", "gitlab", "none"].includes(ci)) throw new UsageError("--ci takes github, gitlab or none");
      const report = init(process.cwd(), { ci: ci as "github" | "gitlab" | "none" | undefined, installMatt: flags.has("--install-matt") });
      report.done.forEach((line) => console.log(`✓ ${line}`));
      if (report.next.length) console.log("\nNext:");
      report.next.forEach((line) => console.log(`  - ${line}`));
      return 0;
    }

    case "base": {
      const base = recordBase(findRoot(), required(args[0], "change"));
      const count = Object.values(base).reduce((n, stories) => n + Object.keys(stories).length, 0);
      console.log(`✓ recorded ${count} story fingerprint(s) in .openspec.yaml`);
      return 0;
    }

    case "archive": {
      const root = findRoot();
      const name = required(args[0], "change");
      if (flags.has("--commit")) {
        const out = commitChange(root, name);
        if (out.snapshot) console.log(`✓ ${out.snapshot} archived change ${name} with the golden files`);
        else console.log(`✓ change ${name} and the golden files were already committed`);
        console.log(`✓ ${out.removal} removed openspec/changes/${name}`);
        if (out.openTasks > 0) console.log(`! ${out.openTasks} task(s) in tasks.md were still open`);
        console.log("\nSquash-merge with proposal.md's Why as the commit body" + (out.noGrill ? ` and the trailer:\n  No-Grill: ${out.noGrill}` : "."));
        return 0;
      }
      const out = mergeChange(root, name);
      if (out.conflicts.length > 0) {
        console.error("✗ nothing was written; resolve these, re-run 'openspec-matt base', then archive again:");
        for (const conflict of out.conflicts) for (const p of conflict.problems) console.error(`  ${conflict.capability}: ${p.message}`);
        return 1;
      }
      for (const [capability, applied] of Object.entries(out.applied)) {
        const created = out.created.includes(capability) ? " (new)" : "";
        console.log(`✓ docs/specs/${capability}.md${created}: ${applied.join(", ")}`);
      }
      console.log(`\nNext: update the other spec sections, re-check this branch's ADRs, review 'git diff', then:\n  openspec-matt archive ${name} --commit`);
      return 0;
    }

    case "lint": {
      const findings = lintRepo(process.cwd());
      findings.forEach((f) => console.log(formatFinding(f)));
      const errors = findings.filter((f) => f.severity === "error").length;
      console.log(errors ? `✗ ${errors} error(s)` : `✓ golden files OK${findings.length ? ` (${findings.length} warning(s))` : ""}`);
      return errors ? 1 : 0;
    }

    case "bootstrap": {
      const created = bootstrap(process.cwd(), args);
      created.forEach((path) => console.log(`✓ created ${path}`));
      console.log("\nNext: ask your agent to run the matt-bootstrap skill to fill them in, then review them in one MR.");
      return 0;
    }

    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return 0;

    default:
      throw new UsageError(`unknown command '${command}'\n\n${HELP}`);
  }
}

function required(value: string | undefined, what: string): string {
  if (!value) throw new UsageError(`missing <${what}>\n\n${HELP}`);
  return value;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) {
    console.error(`openspec-matt: ${error.message}`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
