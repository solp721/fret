import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { writeConfig } from "../core/config.js";
import { writeRules } from "../core/rules.js";
import { compileWithAI } from "../core/compiler.js";
import { LOGO, c, step, done, warn, info, item, box, divider, nl, waitForEnter, startProgress, selectOption } from "./ui.js";
import { syncEslintConfig } from "../core/eslint.js";
import type { Rule } from "../types.js";
import { FRET_DIR, sleep } from "../utils.js";


const CLAUDE_DIR = ".claude";
const HOOKS_DIR = ".claude/hooks";
const TOTAL_STEPS = 5;

// ──────────────────────────────────────────
// 1. 컨벤션 문서 탐색
// ──────────────────────────────────────────

/** 컨벤션 문서의 내용을 보고 이 프로젝트와 관련 있는지 판단 */
async function classifyDoc(root: string, docPath: string): Promise<"frontend" | "backend" | "neutral"> {
  try {
    const content = await fs.readFile(path.join(root, docPath), "utf-8");
    const sample = (docPath + " " + content.substring(0, 500)).toLowerCase();

    // neutral 판단은 경로에서만 (내용에 git이 있다고 neutral이면 안 됨)
    const pathLower = docPath.toLowerCase();
    const neutralPathHints = ["github", "git/", "/git.", "commit", "branch"];
    if (neutralPathHints.some((h) => pathLower.includes(h))) return "neutral";

    const backendHints = ["backend", "백엔드", "kotlin", "java", "spring", "django", "flask", "go ", "rust", "pom.xml", "gradle"];
    const frontendHints = ["frontend", "프론트", "react", "next.js", "tsx", "jsx", "vue", "angular", "tailwind"];

    const isBackend = backendHints.some((h) => sample.includes(h));
    const isFrontend = frontendHints.some((h) => sample.includes(h));

    if (isBackend && !isFrontend) return "backend";
    if (isFrontend && !isBackend) return "frontend";
  } catch { /* skip */ }
  return "neutral";
}

async function findConventionDocs(root: string): Promise<{ docs: string[]; skipped: string[] }> {
  const allDocs: string[] = [];
  const namePatterns = [
    /convention/i, /coding.?style/i, /style.?guide/i,
    /guideline/i, /standard/i, /컨벤션/, /가이드/,
  ];
  const skipDirs = new Set(["node_modules", ".next", ".git", "dist", "build", ".turbo", "coverage"]);

  async function walk(dir: string, relative: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relPath = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (skipDirs.has(entry.name)) continue;
          await walk(path.join(dir, entry.name), relPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          const fullPath = relPath.toLowerCase();
          const matches = namePatterns.some((p) => p.test(entry.name) || p.test(fullPath));
          if (matches) {
            allDocs.push(relPath);
          }
        }
      }
    } catch { /* skip */ }
  }

  await walk(root, "");

  // 프로젝트 소스 코드 언어 감지 (간단히 src/ 안에 뭐가 있는지만 확인)
  let hasTsOrJs = false;
  let hasKotlinOrJava = false;
  try {
    const srcEntries = await fs.readdir(path.join(root, "src"), { recursive: true });
    for (const entry of srcEntries) {
      const name = String(entry);
      if (name.endsWith(".ts") || name.endsWith(".tsx") || name.endsWith(".js") || name.endsWith(".jsx")) hasTsOrJs = true;
      if (name.endsWith(".kt") || name.endsWith(".java")) hasKotlinOrJava = true;
    }
  } catch { /* skip */ }

  const docs: string[] = [];
  const skipped: string[] = [];

  // 프로젝트 스택 판단: 프론트만 있으면 백엔드 문서 스킵, 그 반대도 동일
  const isFrontendProject = hasTsOrJs && !hasKotlinOrJava;
  const isBackendProject = hasKotlinOrJava && !hasTsOrJs;

  for (const doc of allDocs) {
    const docType = await classifyDoc(root, doc);

    if (docType === "neutral") {
      docs.push(doc);
    } else if (docType === "backend" && isFrontendProject) {
      skipped.push(doc);
    } else if (docType === "frontend" && isBackendProject) {
      skipped.push(doc);
    } else {
      docs.push(doc);
    }
  }

  return { docs, skipped };
}

/** 마크다운 파일의 첫 번째 heading을 제목으로 추출 */
async function getDocTitle(root: string, docPath: string): Promise<string> {
  try {
    const content = await fs.readFile(path.join(root, docPath), "utf-8");
    const match = content.match(/^#\s+(.+)/m);
    return match ? match[1].trim() : docPath;
  } catch {
    return docPath;
  }
}

// ──────────────────────────────────────────
// 3. Claude Code 연동 설정
// ──────────────────────────────────────────

function getFretPath(): string {
  try {
    const p = execSync("which fret", { encoding: "utf-8" }).trim();
    if (p) return p;
  } catch { /* fallback */ }
  return path.resolve(new URL(".", import.meta.url).pathname, "..", "build", "index.js");
}

async function createHookScript(root: string): Promise<void> {
  const hooksDir = path.join(root, HOOKS_DIR);
  await fs.mkdir(hooksDir, { recursive: true });

  const fretBin = getFretPath();
  const hookPath = path.join(hooksDir, "fret-check.sh");
  const script = `#!/bin/bash
# Fret auto-check hook
FILE_PATH=$(cat /dev/stdin | node -e "
  let d='';
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try{console.log(JSON.parse(d).tool_input.file_path||'')}
    catch{console.log('')}
  })
")

[ -z "$FILE_PATH" ] && exit 0

case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.mts|*.mjs) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR"
RESULT=$(node "${fretBin}" check --raw "$FILE_PATH" 2>/dev/null)

# 위반이든 통과든 결과를 stdout으로 반환 (알림, 차단 아님)
echo "$RESULT"
exit 0
`;
  await fs.writeFile(hookPath, script, { mode: 0o755 });
}

async function setupClaudeSettings(root: string): Promise<void> {
  const claudeDir = path.join(root, CLAUDE_DIR);
  await fs.mkdir(claudeDir, { recursive: true });
  const settingsPath = path.join(claudeDir, "settings.json");

  let settings: any = {};
  try { settings = JSON.parse(await fs.readFile(settingsPath, "utf-8")); } catch { /* new */ }

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];

  settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
    (h: any) => !h.hooks?.some((hh: any) => hh.command?.includes("fret-check"))
  );
  settings.hooks.PostToolUse.push({
    matcher: "Write|Edit",
    hooks: [{ type: "command", command: `"$CLAUDE_PROJECT_DIR"/.claude/hooks/fret-check.sh` }],
  });

  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}

async function setupMcpConfig(root: string): Promise<void> {
  const mcpPath = path.join(root, ".mcp.json");
  let config: any = {};
  try { config = JSON.parse(await fs.readFile(mcpPath, "utf-8")); } catch { /* new */ }
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers.fret = { command: "node", args: [getFretPath()] };
  await fs.writeFile(mcpPath, JSON.stringify(config, null, 2));
}

async function setupClaudeMd(root: string, conventionPaths: string[]): Promise<void> {
  const claudeMdPath = path.join(root, "CLAUDE.md");
  let existing = "";
  try { existing = await fs.readFile(claudeMdPath, "utf-8"); } catch { /* new */ }

  // 기존 Fret 섹션 제거 후 재작성
  if (existing.includes("## Fret")) {
    existing = existing.replace(/\n## Fret[\s\S]*$/, "").trimEnd();
  }

  const conventionList = conventionPaths.map((p) => `  - \`${p}\``).join("\n");

  // semantic-rules.json에서 읽기
  let semanticList = "  - (없음)";
  try {
    const srContent = await fs.readFile(path.join(root, FRET_DIR, "semantic-rules.json"), "utf-8");
    const sr = JSON.parse(srContent);
    if (sr.rules?.length > 0) {
      semanticList = sr.rules.map((r: any) => `  - [${r.applies_to.join(",")}] ${r.nudge}`).join("\n");
    }
  } catch { /* skip */ }

  const section = `
## Fret - Convention Linter

이 프로젝트는 Fret 컨벤션 린터가 활성화되어 있습니다.

### 자동 검증 (PostToolUse Hook)
- 파일 수정(Write/Edit) 시 자동으로 정적 분석 실행
- 위반 시 hook이 차단하고 에러를 반환함
- 에러를 받으면 아래 양식대로 응답할 것

### Fret 위반 시 응답 양식
hook이 위반을 반환하면 반드시 아래 형식으로 응답하세요:

\`\`\`
🎸 Fret 위반 감지 — [N]건

| # | 파일 | 라인 | 룰 | 위반 내용 |
|---|------|------|----|----------|
| 1 | 파일명 | L## | 룰ID | 설명 |

수정 사항:
- [파일명:라인] 변경 전 → 변경 후
\`\`\`

수정 완료 후 다시 Write/Edit하면 hook이 재검증합니다. PASS될 때까지 반복하세요.

### 컨벤션 문서
${conventionList}

### 의미론적 규칙 (정적 분석 불가 → 직접 준수)
${semanticList || "  - (없음)"}
`;

  const newContent = existing ? existing + "\n" + section : section.trim() + "\n";
  await fs.writeFile(claudeMdPath, newContent);
}

// ──────────────────────────────────────────
// 4. 메인 init
// ──────────────────────────────────────────


// ─── Init sub-steps ───

async function scanConventions(root: string) {
  const { docs, skipped } = await findConventionDocs(root);

  done(`Found ${c.bold(String(docs.length))} document(s)`);
  for (const doc of docs) {
    const title = await getDocTitle(root, doc);
    item(`${c.cyan(doc)} ${c.dim("— " + title)}`);
  }
  if (skipped.length > 0) {
    info(`Skipped ${skipped.length} document(s) ${c.dim("(different stack)")}`);
  }

  return docs;
}

async function compileAndSave(
  root: string,
  conventionDocs: string[],
  useAI: boolean,
  progress: { update: (pct: number, label?: string) => void; finish: (msg: string) => void }
) {
  const compiled = await compileWithAI(root, conventionDocs, (pct, label) => {
    progress.update(pct, label);
  }, useAI);

  const summary = useAI
    ? `${compiled.stats.builtinMatched} builtin + ${compiled.stats.aiGenerated} AI rules`
    : `${compiled.stats.builtinMatched} rule(s) matched`;
  progress.finish(summary);

  // Display rules
  if (compiled.rules.length > 0) {
    done(`${c.bold(c.green(String(compiled.rules.length)))} static rule(s) generated`);
    for (const rule of compiled.rules) {
      const typeLabel = rule.type === "PATH" ? c.magenta("PATH")
        : rule.type === "REGEX" ? c.yellow("REGEX")
        : c.cyan("AST");
      item(`${typeLabel} ${rule.message}`);
    }
  }

  if (compiled.semanticRules.length > 0) {
    nl();
    done(`${c.bold(c.yellow(String(compiled.semanticRules.length)))} semantic rule(s) generated`);
    for (const sr of compiled.semanticRules.slice(0, 5)) {
      item(`${c.dim(sr.applies_to.join(", "))} ${sr.nudge}`);
    }
    if (compiled.semanticRules.length > 5) {
      item(c.dim(`...and ${compiled.semanticRules.length - 5} more`));
    }
  }

  // Save
  await fs.mkdir(path.join(root, FRET_DIR), { recursive: true });
  await writeRules(root, { rules: compiled.rules });
  await writeConfig(root, { conventionPaths: conventionDocs });
  await fs.writeFile(
    path.join(root, FRET_DIR, "semantic-rules.json"),
    JSON.stringify({ rules: compiled.semanticRules }, null, 2)
  );

  return compiled;
}

async function setupIntegrations(root: string) {
  await createHookScript(root);
  await setupClaudeSettings(root);
  await setupMcpConfig(root);
  done("Claude Code integration " + c.dim("(hooks, MCP)"));
}

async function syncESLint(root: string, rules: Rule[]) {
  const result = await syncEslintConfig(root, rules);
  if (result.synced.length > 0) {
    done(`${result.synced.length} rule(s) synced`);
  } else {
    done("No ESLint config found, skipped");
  }
  if (result.needsInstall.length > 0) {
    warn(`Install required: ${c.bold(result.needsInstall.join(", "))}`);
    info(`yarn add -D ${result.needsInstall.join(" ")}`);
  }
}

// ─── Main init flow ───

export async function smartInit(): Promise<void> {
  const root = process.cwd();

  console.log(LOGO);
  divider();
  nl();
  console.log(`  ${c.bold("Project:")} ${path.basename(root)}`);
  console.log(`  ${c.bold("Path:")}    ${c.dim(root)}`);

  const mode = await selectOption([
    { key: "1", label: "Local mode", desc: "Built-in pattern matching only. Fast, no AI needed." },
    { key: "2", label: "AI-assisted mode " + c.yellow("recommended"), desc: "Built-in + AI for deeper coverage. Requires Claude Code." },
  ]);

  console.log(`  ${c.dim("Supported:")} ${c.bold("Claude Code")}  ${c.dim("| Coming soon: Cursor, Copilot, Codex")}`);

  // Step 1
  step(1, TOTAL_STEPS, "Scanning for convention documents...");
  const conventionDocs = await scanConventions(root);
  if (conventionDocs.length === 0) {
    warn("No convention documents found.");
    info("Create a markdown file (e.g. docs/conventions.md) and re-run.");
    return;
  }
  await waitForEnter();

  // Step 2
  const useAI = mode === "2";
  step(2, TOTAL_STEPS, useAI ? "Analyzing conventions with AI..." : "Analyzing conventions...");
  nl();
  const compiled = await compileAndSave(root, conventionDocs, useAI, startProgress("Analyzing..."));
  await waitForEnter();

  // Step 3
  step(3, TOTAL_STEPS, "Setting up project integration...");
  await setupIntegrations(root);

  // Step 4
  step(4, TOTAL_STEPS, "Syncing rules to ESLint...");
  await syncESLint(root, compiled.rules);

  // Step 5
  step(5, TOTAL_STEPS, "Updating CLAUDE.md...");
  await setupClaudeMd(root, conventionDocs);
  done("Done");

  // Complete
  nl();
  divider();
  nl();
  box([
    `${c.green("Fret is ready.")} ${c.dim(`(${useAI ? "AI-assisted" : "Local"} mode)`)}`,
    "",
    `  Static rules    ${c.bold(String(compiled.rules.length))}`,
    `  Semantic rules  ${c.bold(String(compiled.semanticRules.length))}`,
    "",
    `  ${c.dim("Restart Claude Code to activate auto-check.")}`,
  ]);
  nl();
}
