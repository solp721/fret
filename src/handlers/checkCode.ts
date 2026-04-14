import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readRules } from "../core/rules.js";
import { evaluatePathRule, evaluateRegexRule, checkASTBatch } from "../core/engines/index.js";
import { matchFilePattern } from "../utils.js";
import { getNudge } from "../core/nudge.js";
import type { ASTRule, Rule, Violation, HandlerResult } from "../types.js";

function ruleApplies(rule: Rule, filePath: string): boolean {
  if (!rule.filePattern) return true;
  return matchFilePattern(filePath, rule.filePattern);
}

export const checkCodeInputSchema = {
  project_root: z.string().describe("Absolute path to project root"),
  file_paths: z
    .array(z.string())
    .describe("File paths to check (relative to project root)"),
};

export async function handleCheckCode(args: {
  project_root: string;
  file_paths: string[];
}): Promise<HandlerResult> {
  const rules = await readRules(args.project_root);
  if (!rules) {
    return { status: "error", message: "No rules found. Run update_fret_rules first." };
  }

  if (rules.rules.length === 0) {
    return { status: "pass", message: "No rules defined. All files pass by default." };
  }

  const pathRules = rules.rules.filter((r) => r.type === "PATH");
  const regexRules = rules.rules.filter((r) => r.type === "REGEX");
  const astRules = rules.rules.filter((r) => r.type === "AST") as ASTRule[];

  const allViolations: Violation[] = [];

  for (const filePath of args.file_paths) {
    const relativePath = filePath.startsWith("/")
      ? path.relative(args.project_root, filePath)
      : filePath;
    const absolutePath = path.resolve(args.project_root, relativePath);
    const normalizedPath = relativePath.replace(/\\/g, "/");

    for (const rule of pathRules) {
      if (!ruleApplies(rule, normalizedPath)) continue;
      const v = evaluatePathRule(rule, normalizedPath);
      if (v) allViolations.push(v);
    }

    let content: string;
    try {
      content = await fs.readFile(absolutePath, "utf-8");
    } catch {
      allViolations.push({
        ruleId: "SYSTEM",
        message: `Cannot read file: ${normalizedPath}`,
        file: normalizedPath,
      });
      continue;
    }

    for (const rule of regexRules) {
      if (!ruleApplies(rule, normalizedPath)) continue;
      allViolations.push(...evaluateRegexRule(rule, normalizedPath, content));
    }

    allViolations.push(...checkASTBatch(astRules, normalizedPath, content));
  }

  if (allViolations.length === 0) {
    const nudge = args.file_paths.length === 1
      ? await getNudge(args.file_paths[0], args.project_root)
      : "";
    const msg = `All ${args.file_paths.length} file(s) conform to ${rules.rules.length} rule(s).`;
    return { status: "pass", message: nudge ? `${msg}\n${nudge}` : msg };
  }

  return {
    status: "fail",
    message: `${allViolations.length} violation(s) found.`,
    violations: allViolations,
  };
}

/** HandlerResult를 문자열로 포맷 (MCP, CLI --raw 용) */
export function formatResult(result: HandlerResult): string {
  if (result.status === "error") return `ERROR: ${result.message}`;
  if (result.status === "pass") return `PASS: ${result.message}`;

  const lines = result.violations.map((v) => {
    const loc = v.line ? `${v.file}:${v.line}` : v.file;
    return `  [${v.ruleId}] ${loc} -- ${v.message}`;
  });
  return `FAIL: ${result.message}\n\n${lines.join("\n")}`;
}
