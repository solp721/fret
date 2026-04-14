import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { Rule, SemanticRule } from "../types.js";
import { FRET_DIR, sleep } from "../utils.js";

export interface CompileResult {
  rules: Rule[];
  semanticRules: SemanticRule[];
  stats: { builtinMatched: number; aiGenerated: number; cached: boolean };
}

// ──────────────────────────────────────────
// 1. 마크다운 유틸
// ──────────────────────────────────────────

export function stripMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

export function extractRuleLines(content: string): string[] {
  const lines: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const text = stripMarkdown(trimmed.substring(2)).trim();
      if (text.length > 5) lines.push(text);
    }
  }
  return lines;
}

// ──────────────────────────────────────────
// 2. 내장 패턴 (빠른 길 — 0.01초)
// ──────────────────────────────────────────

interface BuiltinPattern {
  /** 이 패턴이 매칭되는 컨벤션 텍스트 */
  match: RegExp;
  /** 생성할 룰 */
  rule: Rule;
}

const BUILTIN_PATTERNS: BuiltinPattern[] = [
  // === REGEX ===
  { match: /var.{0,10}(사용|금지|禁|forbidden|not use|avoid)/i, rule: { id: "no-var", type: "REGEX", target: "\\bvar\\s", action: "BLOCK", message: "" } },
  { match: /any.{0,15}(타입|type)?.{0,10}(금지|禁|forbidden|not use|avoid|절대)/i, rule: { id: "no-any-type", type: "REGEX", target: ":\\s*any\\b", action: "BLOCK", message: "" } },
  { match: /console\.?log.{0,10}(금지|禁|지양|forbidden|avoid|not use)/i, rule: { id: "no-console-log", type: "REGEX", target: "console\\.log", action: "BLOCK", message: "" } },
  { match: /fireEvent.{0,10}(지양|금지|禁|avoid|not use|대신)/i, rule: { id: "no-fire-event", type: "REGEX", target: "fireEvent\\.", action: "BLOCK", message: "" } },
  { match: /querySelector.{0,10}(사용|금지|禁|avoid|not use|forbidden)/i, rule: { id: "no-query-selector", type: "REGEX", target: "\\.querySelector\\(", action: "BLOCK", message: "" } },
  { match: /하드코딩.{0,10}(색상|컬러|color)|hardcoded?.{0,10}color/i, rule: { id: "no-hardcoded-color", type: "REGEX", target: "[\"']#[0-9a-fA-F]{3,8}[\"']", action: "BLOCK", message: "" } },
  { match: /하드코딩.{0,10}(폰트|font|간격|spacing|사이즈|px)|hardcoded?.{0,10}(font|size|spacing|px)/i, rule: { id: "no-hardcoded-size", type: "REGEX", target: "[\"'][0-9]+px[\"']", action: "BLOCK", message: "" } },

  // === AST ===
  { match: /div.{0,15}onClick.{0,10}(금지|禁|forbidden|not use|avoid)/i, rule: { id: "no-div-onclick", type: "AST", condition: { nodeType: "JSXOpeningElement", props: { "name.name": "div", "attributes.name.name": "onClick" } }, action: "BLOCK", message: "" } },
  { match: /span.{0,15}onClick.{0,10}(금지|禁|forbidden|not use|avoid)/i, rule: { id: "no-span-onclick", type: "AST", condition: { nodeType: "JSXOpeningElement", props: { "name.name": "span", "attributes.name.name": "onClick" } }, action: "BLOCK", message: "" } },
  { match: /중첩.{0,5}삼항.{0,5}(금지|禁)|nested.{0,5}ternary.{0,10}(forbidden|avoid|not)/i, rule: { id: "no-nested-ternary", type: "AST", condition: { nodeType: "ConditionalExpression", ancestor: { nodeType: "ConditionalExpression" } }, action: "BLOCK", message: "" } },
  { match: /인라인.{0,10}(함수|function).{0,10}(금지|지양)|inline.{0,10}(function|arrow).{0,10}(forbidden|avoid)/i, rule: { id: "no-inline-arrow-jsx", type: "AST", condition: { nodeType: "ArrowFunctionExpression", ancestor: { nodeType: "JSXExpressionContainer" } }, filePattern: "*.tsx", action: "BLOCK", message: "" } },
  { match: /type.{0,10}(대신|지양).{0,10}interface|interface.{0,10}(사용|use)/i, rule: { id: "no-type-for-object", type: "AST", condition: { nodeType: "TSTypeAliasDeclaration", child: { nodeType: "TSTypeLiteral" } }, action: "BLOCK", message: "" } },
  { match: /(컴포넌트|component).{0,15}(주석|comment).{0,10}(금지|禁|forbidden)|주석.{0,10}(금지|작성 금지)/i, rule: { id: "no-comments-tsx", type: "AST", condition: { nodeType: "Comment" }, filePattern: "*.tsx", action: "BLOCK", message: "" } },
  { match: /key.{0,5}(index|인덱스).{0,10}(금지|지양|禁|avoid|forbidden)/i, rule: { id: "no-key-index", type: "AST", condition: { nodeType: "JSXAttribute", props: { "name.name": "key", "value.expression.name": "index" } }, action: "BLOCK", message: "" } },
  { match: /migration.{0,10}(수정|edit|modify).{0,5}(금지|forbidden)/i, rule: { id: "no-migration-edit", type: "PATH", target: "^migrations?/", action: "BLOCK", message: "" } },
];

/** 내장 패턴으로 빠르게 매칭 */
export function matchBuiltins(fullText: string, ruleLines: string[]): { matched: Rule[]; unmatchedLines: string[] } {
  const cleanText = stripMarkdown(fullText);
  const matched: Rule[] = [];
  const usedIds = new Set<string>();
  const matchedLineIndices = new Set<number>();

  for (const pattern of BUILTIN_PATTERNS) {
    if (!pattern.match.test(cleanText)) continue;
    if (usedIds.has(pattern.rule.id)) continue;

    // 매칭된 원문 라인을 찾아서 message로 사용
    let message = "";
    for (let i = 0; i < ruleLines.length; i++) {
      if (pattern.match.test(stripMarkdown(ruleLines[i]))) {
        message = ruleLines[i];
        matchedLineIndices.add(i);
        break;
      }
    }
    if (!message) {
      // 전체 텍스트에서 매칭됐지만 라인 단위로는 못 찾은 경우
      message = pattern.rule.id.replace(/-/g, " ");
    }

    const rule = { ...pattern.rule, message };
    matched.push(rule);
    usedIds.add(rule.id);
  }

  // 내장 패턴으로 안 잡힌 라인들
  const unmatchedLines = ruleLines.filter((_, i) => !matchedLineIndices.has(i));

  return { matched, unmatchedLines };
}

// ──────────────────────────────────────────
// 3. AI 컴파일 (느린 길 — 나머지만)
// ──────────────────────────────────────────

const AI_PROMPT = `You are a coding convention analyzer. The rules below could NOT be converted to static rules automatically. Analyze each and generate rules.

## Rule Types

### REGEX — block text patterns
{ "id": "string", "type": "REGEX", "target": "regex", "filePattern": "*.tsx", "action": "BLOCK", "message": "string" }

### AST — block structural code patterns (Babel AST)
{
  "id": "string", "type": "AST",
  "condition": {
    "nodeType": "BabelNodeType",
    "props": { "dot.path": "value" | { "regex": "..." } | { "startsWith": "..." } | { "not": {...} } },
    "parent|ancestor|child|descendant": { "nodeType": "...", "props": {} }
  },
  "filePattern": "*.tsx", "action": "BLOCK", "message": "string"
}

Property paths: JSXOpeningElement→name.name, attributes.name.name | JSXAttribute→name.name, value.expression.name | CallExpression→callee.name, callee.property.name | TSTypeAliasDeclaration→id.name | Comment nodeType→checks ast.comments

### Semantic — ONLY for truly impossible static checks
{ "id": "string", "applies_to": ["*.tsx"], "nudge": "under 10 words" }

## Rules
1. Maximize static rules. Semantic only for truly impossible cases.
2. Write messages in the same language as the input.
3. Each id must be unique kebab-case.
4. Do NOT create rules for vague guidelines.

## Output (JSON only, no explanation):

===RULES_JSON===
{ "rules": [...] }
===SEMANTIC_JSON===
{ "rules": [...] }
===END===

## Remaining conventions to analyze:

`;

function runClaude(tmpFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("sh", ["-c", `cat "${tmpFile}" | claude -p --model haiku`], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `exit ${code}`));
    });

    proc.on("error", reject);

    setTimeout(() => { proc.kill(); reject(new Error("timeout")); }, 120000);
  });
}

async function compileRemainingWithAI(root: string, unmatchedLines: string[]): Promise<{ rules: Rule[]; semanticRules: SemanticRule[] }> {
  if (unmatchedLines.length === 0) return { rules: [], semanticRules: [] };

  const prompt = AI_PROMPT + unmatchedLines.map((l, i) => `${i + 1}. ${l}`).join("\n");

  try {
    const tmpFile = path.join(root, FRET_DIR, ".compile-prompt.tmp");
    await fs.mkdir(path.join(root, FRET_DIR), { recursive: true });
    await fs.writeFile(tmpFile, prompt);

    const result = await runClaude(tmpFile);

    await fs.unlink(tmpFile).catch(() => {});
    return parseAIResult(result);
  } catch {
    return {
      rules: [],
      semanticRules: unmatchedLines.map((line, i) => ({
        id: `semantic-${i + 1}`,
        applies_to: ["*"],
        nudge: line.length > 50 ? line.substring(0, 47) + "..." : line,
      })),
    };
  }
}

export function parseAIResult(raw: string): { rules: Rule[]; semanticRules: SemanticRule[] } {
  const rulesMatch = raw.match(/===RULES_JSON===\s*([\s\S]*?)\s*===SEMANTIC_JSON===/);
  const semanticMatch = raw.match(/===SEMANTIC_JSON===\s*([\s\S]*?)\s*===END===/);

  let rules: Rule[] = [];
  let semanticRules: SemanticRule[] = [];

  if (rulesMatch) {
    try { rules = JSON.parse(rulesMatch[1].trim()).rules ?? []; }
    catch (err) { console.error(`[fret] Failed to parse AI rules output: ${err instanceof Error ? err.message : err}`); }
  }
  if (semanticMatch) {
    try { semanticRules = JSON.parse(semanticMatch[1].trim()).rules ?? []; }
    catch (err) { console.error(`[fret] Failed to parse AI semantic output: ${err instanceof Error ? err.message : err}`); }
  }

  return { rules, semanticRules };
}

// ──────────────────────────────────────────
// 4. 캐시
// ──────────────────────────────────────────

interface CacheData {
  hash: string;
  result: CompileResult;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 16);
}

async function readCache(root: string): Promise<CacheData | null> {
  try {
    const content = await fs.readFile(path.join(root, FRET_DIR, ".compile-cache.json"), "utf-8");
    return JSON.parse(content);
  } catch { return null; }
}

async function writeCache(root: string, data: CacheData): Promise<void> {
  await fs.mkdir(path.join(root, FRET_DIR), { recursive: true });
  await fs.writeFile(path.join(root, FRET_DIR, ".compile-cache.json"), JSON.stringify(data));
}


// ──────────────────────────────────────────
// 5. 메인 함수
// ──────────────────────────────────────────

export async function compileWithAI(
  root: string,
  conventionDocs: string[],
  onProgress?: (pct: number, label: string) => void,
  useAI = true
): Promise<CompileResult> {
  // 문서 읽기
  let allContent = "";
  for (const docPath of conventionDocs) {
    try {
      const content = await fs.readFile(path.join(root, docPath), "utf-8");
      allContent += content + "\n";
    } catch { /* skip */ }
  }

  // 캐시 확인
  const contentHash = hashContent(allContent);
  const cache = await readCache(root);
  if (cache && cache.hash === contentHash) {
    onProgress?.(100, "Cached");
    return { ...cache.result, stats: { ...cache.result.stats, cached: true } };
  }

  onProgress?.(10, "Parsing conventions...");

  const ruleLines = extractRuleLines(allContent);

  onProgress?.(25, "Matching patterns...");

  const { matched: builtinRules, unmatchedLines } = matchBuiltins(allContent, ruleLines);

  onProgress?.(40, `${builtinRules.length} builtin rules matched`);

  // 2단계: 나머지를 AI로
  let aiRules: Rule[] = [];
  let semanticRules: SemanticRule[] = [];

  if (unmatchedLines.length > 0 && useAI) {
    onProgress?.(45, `Analyzing ${unmatchedLines.length} remaining rules`);

    let aiPct = 45;
    const aiTimer = setInterval(() => {
      if (aiPct < 92) {
        const remaining = 92 - aiPct;
        const increment = Math.max(1, Math.floor(remaining * 0.08));
        aiPct += increment;
        if (aiPct > 92) aiPct = 92;
        const labels = ["Reading conventions", "Classifying rules", "Generating static rules", "Generating AST rules", "Generating semantic rules", "Finalizing"];
        const labelIdx = Math.min(Math.floor((aiPct - 45) / 8), labels.length - 1);
        onProgress?.(aiPct, labels[labelIdx]);
      }
    }, 300);

    const aiResult = await compileRemainingWithAI(root, unmatchedLines);
    clearInterval(aiTimer);

    aiRules = aiResult.rules;
    semanticRules = aiResult.semanticRules;
  } else if (unmatchedLines.length > 0 && !useAI) {
    // Local mode: 나머지는 전부 semantic으로
    semanticRules = unmatchedLines.map((line, i) => ({
      id: `semantic-${i + 1}`,
      applies_to: ["*"],
      nudge: line.length > 50 ? line.substring(0, 47) + "..." : line,
    }));
    onProgress?.(90, "Skipping AI analysis");
  }

  onProgress?.(95, "Saving...");

  // 합치기 (ID 중복 제거)
  const allRules: Rule[] = [...builtinRules];
  const usedIds = new Set(builtinRules.map((r) => r.id));
  for (const rule of aiRules) {
    if (!usedIds.has(rule.id)) {
      usedIds.add(rule.id);
      allRules.push(rule);
    }
  }

  const result: CompileResult = {
    rules: allRules,
    semanticRules,
    stats: { builtinMatched: builtinRules.length, aiGenerated: aiRules.length, cached: false },
  };

  // 캐시 저장
  await writeCache(root, { hash: contentHash, result });

  onProgress?.(100, "Done");
  return result;
}
