import { describe, it, expect } from "vitest";
import { formatResult } from "../../src/handlers/checkCode.js";
import type { HandlerResult } from "../../src/types.js";

describe("formatResult", () => {
  it("formats pass result", () => {
    const result: HandlerResult = { status: "pass", message: "All files pass." };
    expect(formatResult(result)).toBe("PASS: All files pass.");
  });

  it("formats error result", () => {
    const result: HandlerResult = { status: "error", message: "No rules found." };
    expect(formatResult(result)).toBe("ERROR: No rules found.");
  });

  it("formats fail result with violations", () => {
    const result: HandlerResult = {
      status: "fail",
      message: "2 violation(s) found.",
      violations: [
        { ruleId: "no-var", message: "no var", file: "app.ts", line: 3 },
        { ruleId: "no-console", message: "no console", file: "app.ts", line: 7 },
      ],
    };
    const formatted = formatResult(result);
    expect(formatted).toContain("FAIL:");
    expect(formatted).toContain("[no-var] app.ts:3");
    expect(formatted).toContain("[no-console] app.ts:7");
  });

  it("formats violation without line number", () => {
    const result: HandlerResult = {
      status: "fail",
      message: "1 violation(s) found.",
      violations: [
        { ruleId: "no-dist", message: "blocked", file: "dist/bundle.js" },
      ],
    };
    const formatted = formatResult(result);
    expect(formatted).toContain("[no-dist] dist/bundle.js --");
  });
});
