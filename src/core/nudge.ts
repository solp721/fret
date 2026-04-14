import fs from "node:fs/promises";
import path from "node:path";
import { matchFilePattern, FRET_DIR } from "../utils.js";
import type { SemanticRule } from "../types.js";

export async function getNudge(filePath: string, projectRoot: string): Promise<string> {
  let rules: SemanticRule[];
  try {
    const content = await fs.readFile(path.join(projectRoot, FRET_DIR, "semantic-rules.json"), "utf-8");
    rules = JSON.parse(content).rules ?? [];
  } catch {
    return "";
  }

  if (rules.length === 0) return "";

  const applicable = rules.filter((r) =>
    r.applies_to.some((pattern) => matchFilePattern(filePath, pattern))
  );

  if (applicable.length === 0) return "";

  const nudges = applicable.map((r) => r.nudge).join(", ");
  return `[Fret] Self-check: ${nudges}`;
}
