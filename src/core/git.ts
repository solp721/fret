import { execSync } from "node:child_process";
import { isCodeFile } from "../utils.js";

export function getChangedFiles(cwd: string): string[] {
  try {
    const tracked = execSync("git diff --name-only HEAD 2>/dev/null || git diff --name-only", {
      cwd,
      encoding: "utf-8",
    }).trim();

    const staged = execSync("git diff --cached --name-only", {
      cwd,
      encoding: "utf-8",
    }).trim();

    const untracked = execSync("git ls-files --others --exclude-standard", {
      cwd,
      encoding: "utf-8",
    }).trim();

    const all = new Set<string>();
    for (const output of [tracked, staged, untracked]) {
      if (output) {
        for (const line of output.split("\n")) {
          const trimmed = line.trim();
          if (trimmed && isCodeFile(trimmed)) all.add(trimmed);
        }
      }
    }
    return [...all].sort();
  } catch {
    return [];
  }
}
