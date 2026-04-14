import fs from "node:fs";
import path from "node:path";
import { handleCheckCode } from "../handlers/checkCode.js";
import { readRules } from "../core/rules.js";
import { isCodeFile } from "../utils.js";

export async function runWatch(dirs: string[]) {
  const root = process.cwd();
  const rules = await readRules(root);
  if (!rules || rules.rules.length === 0) {
    console.error("No rules found. Run `fret rules <rules.json>` first.");
    process.exit(1);
  }

  const watchDirs = dirs.length > 0 ? dirs : ["src"];
  console.log(`Watching: ${watchDirs.join(", ")} (${rules.rules.length} rules loaded)`);
  console.log("Ctrl+C to stop\n");

  const pending = new Map<string, NodeJS.Timeout>();

  for (const dir of watchDirs) {
    const absDir = path.resolve(root, dir);
    try {
      fs.accessSync(absDir);
    } catch {
      console.error(`Directory not found: ${dir}`);
      continue;
    }

    fs.watch(absDir, { recursive: true }, (_event, filename) => {
      if (!filename || !isCodeFile(filename)) return;

      const relativePath = path.join(dir, filename);
      const existing = pending.get(relativePath);
      if (existing) clearTimeout(existing);

      pending.set(
        relativePath,
        setTimeout(async () => {
          pending.delete(relativePath);
          const timestamp = new Date().toLocaleTimeString();
          try {
            const result = await handleCheckCode({
              project_root: root,
              file_paths: [relativePath],
            });
            if (result.status === "pass") {
              console.log(`[${timestamp}] PASS ${relativePath}`);
            } else if (result.status === "fail") {
              const lines = result.violations.map((v) => {
                const loc = v.line ? `${v.file}:${v.line}` : v.file;
                return `  [${v.ruleId}] ${loc} -- ${v.message}`;
              });
              console.log(`\n[${timestamp}] FAIL: ${result.violations.length} violation(s)\n${lines.join("\n")}\n`);
            }
          } catch (err) {
            console.error(`[${timestamp}] Error checking ${relativePath}:`, err);
          }
        }, 300)
      );
    });
  }

  await new Promise(() => {});
}
