import type { Rule, Violation } from "../../types.js";
import { checkPath } from "./path.js";
import { checkRegex } from "./regex.js";
import { checkASTBatch } from "./ast.js";

export function evaluatePathRule(rule: Rule & { type: "PATH" }, filePath: string): Violation | null {
  try {
    return checkPath(rule, filePath);
  } catch (err) {
    console.error(`[fret] PATH rule "${rule.id}" failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export function evaluateRegexRule(rule: Rule & { type: "REGEX" }, filePath: string, content: string): Violation[] {
  try {
    return checkRegex(rule, filePath, content);
  } catch (err) {
    console.error(`[fret] REGEX rule "${rule.id}" failed: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

export { checkASTBatch };
