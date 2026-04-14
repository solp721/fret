import path from "node:path";
import fs from "node:fs/promises";
import { handleCheckCode, formatResult } from "../handlers/checkCode.js";
import { handleAuditCode } from "../handlers/auditCode.js";
import { handleUpdateRules } from "../handlers/updateRules.js";
import { handleSetConventionDocs } from "../handlers/setConventionDocs.js";
import { readConfig } from "../core/config.js";
import { readRules } from "../core/rules.js";
import { getChangedFiles } from "../core/git.js";
import { runWatch } from "./watch.js";
import { smartInit } from "./init.js";
import { LOGO, LOGO_MINI, c, divider, box, header } from "./ui.js";

const HELP = `
${LOGO}
  ${c.bold("Usage:")}

    ${c.cyan("fret init")}                          Initialize project (auto-detect conventions)
    ${c.cyan("fret check")} ${c.dim("[files...]")}              Static rule check ${c.dim("(auto-detects git changes)")}
    ${c.cyan("fret audit")} ${c.dim("[files...]")}              Semantic convention review
    ${c.cyan("fret watch")} ${c.dim("[dirs...]")}               Watch mode — check on save ${c.dim("(default: src/)")}
    ${c.cyan("fret status")}                        Show current config & rules
    ${c.cyan("fret serve")}                         MCP server mode (stdio)

  ${c.bold("Setup:")}

    ${c.cyan("fret docs")} ${c.dim("<convention.md ...>")}     Register convention markdown
    ${c.cyan("fret rules")} ${c.dim("<rules.json>")}           Load rules from JSON file

  ${c.bold("Examples:")}

    ${c.dim("$")} fret init                          ${c.dim("# scan, compile, hook — all automatic")}
    ${c.dim("$")} fret check                         ${c.dim("# check all git-changed files")}
    ${c.dim("$")} fret check src/App.tsx              ${c.dim("# check specific file")}
    ${c.dim("$")} fret watch src components           ${c.dim("# watch multiple dirs")}
`;

function resolve(filePath: string): string {
  return path.resolve(process.cwd(), filePath);
}

function resolveFiles(files: string[]): string[] {
  if (files.length > 0) return files;

  const changed = getChangedFiles(process.cwd());
  if (changed.length === 0) {
    console.log(`\n  ${LOGO_MINI} ${c.dim("No changed files detected.")}\n`);
    process.exit(0);
  }
  console.log(`\n  ${LOGO_MINI} ${c.dim("Auto-detected")} ${c.bold(String(changed.length))} ${c.dim("changed file(s):")}`);
  for (const f of changed) console.log(`    ${c.dim("→")} ${f}`);
  console.log("");
  return changed;
}

async function check(files: string[], raw = false) {
  const targets = raw ? files : resolveFiles(files);
  const result = await handleCheckCode({
    project_root: process.cwd(),
    file_paths: targets,
  });

  if (raw) {
    console.log(formatResult(result));
    if (result.status === "fail") process.exit(1);
    return;
  }

  if (result.status === "error") {
    console.log(`\n  ${c.red("✗")} ${result.message}\n`);
    process.exit(1);
  }

  if (result.status === "pass") {
    console.log(`  ${c.bgGreen("PASS")} ${c.green(result.message)}\n`);
  } else {
    console.log(`  ${c.bgRed("FAIL")} ${c.red(result.message)}`);
    for (const v of result.violations) {
      const loc = v.line ? `${v.file}:${v.line}` : v.file;
      console.log(`    ${c.red("✗")} ${c.dim(`[${v.ruleId}]`)} ${c.white(loc)} ${c.dim("—")} ${v.message}`);
    }
    console.log("");
    process.exit(1);
  }
}

async function audit(files: string[]) {
  const targets = resolveFiles(files);
  const result = await handleAuditCode({
    project_root: process.cwd(),
    file_paths: targets,
  });
  console.log(result);
}

async function loadRules(rulesFile: string) {
  const absPath = resolve(rulesFile);
  let content: string;
  try {
    content = await fs.readFile(absPath, "utf-8");
  } catch {
    console.error(`\n  ${c.red("✗")} Cannot read: ${rulesFile}\n`);
    process.exit(1);
  }

  const parsed = JSON.parse(content);
  const rules = parsed.rules ?? parsed;

  const result = await handleUpdateRules({
    project_root: process.cwd(),
    rules: Array.isArray(rules) ? rules : [],
  });
  console.log(`\n  ${c.green("✓")} ${result}\n`);
}

async function docs(conventionFiles: string[]) {
  if (conventionFiles.length === 0) {
    console.error(`\n  ${c.red("✗")} Usage: fret docs <convention1.md> [convention2.md] ...\n`);
    process.exit(1);
  }
  const result = await handleSetConventionDocs({
    project_root: process.cwd(),
    convention_paths: conventionFiles,
  });
  console.log(`\n  ${c.green("✓")} ${result}\n`);
}

async function status() {
  const root = process.cwd();
  const config = await readConfig(root);
  const rules = await readRules(root);
  const projectName = path.basename(root);

  console.log(`\n  ${LOGO_MINI} ${c.dim("status for")} ${c.bold(projectName)}`);
  divider();

  header("Convention Docs");
  if (config.conventionPaths.length === 0) {
    console.log(`    ${c.dim("(none)")} ${c.dim("— run: fret docs <file.md>")}`);
  } else {
    for (const p of config.conventionPaths) {
      console.log(`    ${c.cyan("→")} ${p}`);
    }
  }

  header("Static Rules");
  if (!rules || rules.rules.length === 0) {
    console.log(`    ${c.dim("(none)")} ${c.dim("— run: fret init or fret rules <file>")}`);
  } else {
    for (const r of rules.rules) {
      const typeLabel = r.type === "PATH" ? c.magenta("PATH ")
        : r.type === "REGEX" ? c.yellow("REGEX")
        : c.cyan("AST  ");
      console.log(`    ${typeLabel} ${c.dim(`[${r.id}]`)} ${r.message}`);
    }
  }

  // Hook 상태 확인
  header("Integration");
  try {
    await fs.access(path.join(root, ".claude/hooks/fret-check.sh"));
    console.log(`    ${c.green("✓")} Claude Code hook ${c.dim("(.claude/hooks/fret-check.sh)")}`);
  } catch {
    console.log(`    ${c.red("✗")} Claude Code hook not found ${c.dim("— run: fret init")}`);
  }
  try {
    const mcpContent = await fs.readFile(path.join(root, ".mcp.json"), "utf-8");
    if (mcpContent.includes("fret")) {
      console.log(`    ${c.green("✓")} MCP server ${c.dim("(.mcp.json)")}`);
    }
  } catch {
    console.log(`    ${c.red("✗")} MCP server not registered ${c.dim("— run: fret init")}`);
  }

  console.log("");
}

export async function runCLI() {
  const args = process.argv.slice(2);
  const command = args[0];
  const rest = args.slice(1);

  switch (command) {
    case "init":
      return smartInit();
    case "check": {
      const isRaw = rest.includes("--raw");
      const files = rest.filter((a) => a !== "--raw");
      return check(files, isRaw);
    }
    case "audit":
      return audit(rest);
    case "watch":
      return runWatch(rest);
    case "rules":
      if (!rest[0]) { console.error(`\n  ${c.red("✗")} Usage: fret rules <rules.json>\n`); process.exit(1); }
      return loadRules(rest[0]);
    case "docs":
      return docs(rest);
    case "status":
      return status();
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    default:
      console.log(HELP);
      process.exit(1);
  }
}
