import { execFileSync } from "node:child_process";

export function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function stagedFiles(root: string): string[] {
  const out = git(root, "diff", "--cached", "--name-only");
  return out ? out.split("\n") : [];
}
