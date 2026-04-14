import fs from "node:fs/promises";
import path from "node:path";

import { FRET_DIR } from "../utils.js";
const CONFIG_FILE = "config.json";

export interface FretConfig {
  conventionPaths: string[];
}

const DEFAULT_CONFIG: FretConfig = {
  conventionPaths: [],
};

export async function readConfig(projectRoot: string): Promise<FretConfig> {
  try {
    const filePath = path.join(projectRoot, FRET_DIR, CONFIG_FILE);
    const content = await fs.readFile(filePath, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function writeConfig(projectRoot: string, config: FretConfig): Promise<void> {
  const dirPath = path.join(projectRoot, FRET_DIR);
  await fs.mkdir(dirPath, { recursive: true });
  const filePath = path.join(dirPath, CONFIG_FILE);
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
}
