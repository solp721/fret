import { describe, it, expect } from "vitest";
import { checkRegex } from "../../../src/core/engines/regex.js";
import type { RegexRule } from "../../../src/types.js";

function makeRule(target: string): RegexRule {
  return { id: "test", type: "REGEX", target, action: "BLOCK", message: "test" };
}

describe("REGEX Engine", () => {
  it("detects pattern with correct line number", () => {
    const rule = makeRule("\\bvar\\s");
    const code = "const a = 1;\nvar b = 2;\nconst c = 3;";
    const violations = checkRegex(rule, "test.ts", code);
    expect(violations.length).toBe(1);
    expect(violations[0].line).toBe(2);
  });

  it("detects multiple matches", () => {
    const rule = makeRule("console\\.log");
    const code = "console.log('a');\nconst x = 1;\nconsole.log('b');";
    const violations = checkRegex(rule, "test.ts", code);
    expect(violations.length).toBe(2);
    expect(violations[0].line).toBe(1);
    expect(violations[1].line).toBe(3);
  });

  it("returns empty for no matches", () => {
    const rule = makeRule("\\bvar\\s");
    const code = "const a = 1;\nlet b = 2;";
    const violations = checkRegex(rule, "test.ts", code);
    expect(violations.length).toBe(0);
  });

  it("handles invalid regex gracefully", () => {
    const rule = makeRule("[invalid(");
    const violations = checkRegex(rule, "test.ts", "any content");
    expect(violations.length).toBe(0);
  });

  it("includes file path in violation", () => {
    const rule = makeRule("TODO");
    const violations = checkRegex(rule, "src/app.ts", "// TODO fix this");
    expect(violations[0].file).toBe("src/app.ts");
  });
});
