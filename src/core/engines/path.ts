import type { PathRule, Violation } from "../../types.js";

export function checkPath(rule: PathRule, filePath: string): Violation | null {
  try {
    const regex = new RegExp(rule.target);
    if (regex.test(filePath)) {
      return {
        ruleId: rule.id,
        message: rule.message,
        file: filePath,
      };
    }
    return null;
  } catch (err) {
    console.error(`[fret] Invalid regex in PATH rule "${rule.id}": ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
