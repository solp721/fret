import type { RegexRule, Violation } from "../../types.js";

export function checkRegex(rule: RegexRule, filePath: string, content: string): Violation[] {
  const violations: Violation[] = [];
  try {
    const regex = new RegExp(rule.target, "gm");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const line = content.substring(0, match.index).split("\n").length;
      violations.push({
        ruleId: rule.id,
        message: rule.message,
        file: filePath,
        line,
      });
    }
  } catch (err) {
    console.error(`[fret] Invalid regex in REGEX rule "${rule.id}": ${err instanceof Error ? err.message : err}`);
  }
  return violations;
}
