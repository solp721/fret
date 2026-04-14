import fs from "node:fs/promises";
import path from "node:path";
import type { RulesFile } from "../types.js";
import { FRET_DIR } from "../utils.js";

const RULES_FILE = "rules.json";

export async function readRules(projectRoot: string): Promise<RulesFile | null> {
  try {
    const filePath = path.join(projectRoot, FRET_DIR, RULES_FILE);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as RulesFile;
  } catch {
    return null;
  }
}

export async function writeRules(projectRoot: string, rules: RulesFile): Promise<void> {
  const dirPath = path.join(projectRoot, FRET_DIR);
  await fs.mkdir(dirPath, { recursive: true });
  const filePath = path.join(dirPath, RULES_FILE);
  await fs.writeFile(filePath, JSON.stringify(rules, null, 2), "utf-8");
}
