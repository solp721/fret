import { z } from "zod";
import { readConfig, writeConfig } from "../core/config.js";

export const setConventionDocsInputSchema = {
  project_root: z.string().describe("Absolute path to project root"),
  convention_paths: z
    .array(z.string())
    .describe("Markdown convention file paths (relative to project root)"),
};

export async function handleSetConventionDocs(args: {
  project_root: string;
  convention_paths: string[];
}): Promise<string> {
  const config = await readConfig(args.project_root);
  config.conventionPaths = args.convention_paths;
  await writeConfig(args.project_root, config);
  return `Registered ${args.convention_paths.length} convention doc(s):\n${args.convention_paths.map((p) => `  - ${p}`).join("\n")}`;
}
