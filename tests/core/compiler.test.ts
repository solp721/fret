import { describe, it, expect } from "vitest";
import { stripMarkdown, extractRuleLines, matchBuiltins, parseAIResult } from "../../src/core/compiler.js";

describe("Compiler", () => {
  describe("stripMarkdown", () => {
    it("strips inline code backticks", () => {
      expect(stripMarkdown("`var` 사용 금지")).toBe("var 사용 금지");
    });

    it("strips bold markers", () => {
      expect(stripMarkdown("**반드시** interface 사용")).toBe("반드시 interface 사용");
    });

    it("strips italic markers", () => {
      expect(stripMarkdown("*반드시* const 사용")).toBe("반드시 const 사용");
    });

    it("strips markdown links", () => {
      expect(stripMarkdown("[참고](https://example.com) 문서")).toBe("참고 문서");
    });

    it("strips multiple formatting at once", () => {
      expect(stripMarkdown("**`var`** 사용 [금지](url)")).toBe("var 사용 금지");
    });

    it("returns plain text unchanged", () => {
      expect(stripMarkdown("console.log 금지")).toBe("console.log 금지");
    });
  });

  describe("extractRuleLines", () => {
    it("extracts bullet point lines with - prefix", () => {
      const content = "# Rules\n- var 사용 금지\n- any 타입 금지";
      const lines = extractRuleLines(content);
      expect(lines).toEqual(["var 사용 금지", "any 타입 금지"]);
    });

    it("extracts bullet point lines with * prefix", () => {
      const content = "# Rules\n* console.log 금지\n* 인라인 함수 금지";
      const lines = extractRuleLines(content);
      expect(lines).toEqual(["console.log 금지", "인라인 함수 금지"]);
    });

    it("strips markdown from extracted lines", () => {
      const content = "- `var` 사용 금지\n- **any** 타입 금지";
      const lines = extractRuleLines(content);
      expect(lines).toEqual(["var 사용 금지", "any 타입 금지"]);
    });

    it("skips short lines (<=5 chars)", () => {
      const content = "- abc\n- var 사용 금지\n- hi";
      const lines = extractRuleLines(content);
      expect(lines).toEqual(["var 사용 금지"]);
    });

    it("ignores non-bullet lines", () => {
      const content = "# Title\nsome text\n- actual rule here";
      const lines = extractRuleLines(content);
      expect(lines).toEqual(["actual rule here"]);
    });

    it("returns empty for no bullets", () => {
      const content = "# Title\nJust some paragraph text.";
      const lines = extractRuleLines(content);
      expect(lines).toEqual([]);
    });
  });

  describe("matchBuiltins", () => {
    it("matches no-var pattern", () => {
      const { matched } = matchBuiltins("var 사용 금지", ["var 사용 금지"]);
      expect(matched.some((r) => r.id === "no-var")).toBe(true);
    });

    it("matches no-var english pattern", () => {
      const { matched } = matchBuiltins("var is forbidden", ["var is forbidden"]);
      expect(matched.some((r) => r.id === "no-var")).toBe(true);
    });

    it("matches no-any-type pattern", () => {
      const { matched } = matchBuiltins("any 타입 절대 금지", ["any 타입 절대 금지"]);
      expect(matched.some((r) => r.id === "no-any-type")).toBe(true);
    });

    it("matches no-console-log pattern", () => {
      const { matched } = matchBuiltins("console.log 금지", ["console.log 금지"]);
      expect(matched.some((r) => r.id === "no-console-log")).toBe(true);
    });

    it("matches no-div-onclick pattern", () => {
      const { matched } = matchBuiltins("div onClick 금지", ["div onClick 금지"]);
      expect(matched.some((r) => r.id === "no-div-onclick")).toBe(true);
    });

    it("matches no-nested-ternary pattern", () => {
      const { matched } = matchBuiltins("중첩 삼항 금지", ["중첩 삼항 금지"]);
      expect(matched.some((r) => r.id === "no-nested-ternary")).toBe(true);
    });

    it("matches no-inline-arrow-jsx pattern", () => {
      const { matched } = matchBuiltins("인라인 함수 금지", ["인라인 함수 금지"]);
      expect(matched.some((r) => r.id === "no-inline-arrow-jsx")).toBe(true);
    });

    it("matches no-hardcoded-color pattern", () => {
      const { matched } = matchBuiltins("하드코딩 색상값 금지", ["하드코딩 색상값 금지"]);
      expect(matched.some((r) => r.id === "no-hardcoded-color")).toBe(true);
    });

    it("matches no-fire-event pattern", () => {
      const { matched } = matchBuiltins("fireEvent 사용 금지", ["fireEvent 사용 금지"]);
      expect(matched.some((r) => r.id === "no-fire-event")).toBe(true);
    });

    it("matches no-query-selector pattern", () => {
      const { matched } = matchBuiltins("querySelector 사용 금지", ["querySelector 사용 금지"]);
      expect(matched.some((r) => r.id === "no-query-selector")).toBe(true);
    });

    it("matches no-key-index pattern", () => {
      const { matched } = matchBuiltins("key index 금지", ["key index 금지"]);
      expect(matched.some((r) => r.id === "no-key-index")).toBe(true);
    });

    it("matches no-migration-edit pattern", () => {
      const { matched } = matchBuiltins("migration 수정 금지", ["migration 수정 금지"]);
      expect(matched.some((r) => r.id === "no-migration-edit")).toBe(true);
    });

    it("uses original line as message", () => {
      const { matched } = matchBuiltins("var 사용 금지", ["var 사용 금지"]);
      const rule = matched.find((r) => r.id === "no-var");
      expect(rule?.message).toBe("var 사용 금지");
    });

    it("returns unmatched lines", () => {
      const { unmatchedLines } = matchBuiltins(
        "var 사용 금지\n커스텀 규칙 뭔가",
        ["var 사용 금지", "커스텀 규칙 뭔가"]
      );
      expect(unmatchedLines).toEqual(["커스텀 규칙 뭔가"]);
    });

    it("does not duplicate rule IDs", () => {
      const { matched } = matchBuiltins(
        "var 사용 금지. var is forbidden.",
        ["var 사용 금지", "var is forbidden"]
      );
      const varRules = matched.filter((r) => r.id === "no-var");
      expect(varRules.length).toBe(1);
    });

    it("returns empty for no matches", () => {
      const { matched } = matchBuiltins("아무 상관없는 텍스트", ["아무 상관없는 텍스트"]);
      expect(matched.length).toBe(0);
    });

    it("matches multiple patterns at once", () => {
      const text = "var 사용 금지\nconsole.log 금지\n중첩 삼항 금지";
      const lines = ["var 사용 금지", "console.log 금지", "중첩 삼항 금지"];
      const { matched } = matchBuiltins(text, lines);
      expect(matched.length).toBe(3);
      expect(matched.map((r) => r.id).sort()).toEqual(["no-console-log", "no-nested-ternary", "no-var"]);
    });
  });

  describe("parseAIResult", () => {
    it("parses valid rules and semantic output", () => {
      const raw = `
===RULES_JSON===
{"rules": [{"id": "no-eval", "type": "REGEX", "target": "\\\\beval\\\\(", "action": "BLOCK", "message": "eval 금지"}]}
===SEMANTIC_JSON===
{"rules": [{"id": "s1", "applies_to": ["*.tsx"], "nudge": "Check naming"}]}
===END===`;
      const result = parseAIResult(raw);
      expect(result.rules.length).toBe(1);
      expect(result.rules[0].id).toBe("no-eval");
      expect(result.semanticRules.length).toBe(1);
      expect(result.semanticRules[0].id).toBe("s1");
    });

    it("returns empty arrays for missing sections", () => {
      const result = parseAIResult("some garbage output");
      expect(result.rules).toEqual([]);
      expect(result.semanticRules).toEqual([]);
    });

    it("handles only rules section", () => {
      const raw = `
===RULES_JSON===
{"rules": [{"id": "r1", "type": "REGEX", "target": "x", "action": "BLOCK", "message": "m"}]}
===SEMANTIC_JSON===
===END===`;
      const result = parseAIResult(raw);
      expect(result.rules.length).toBe(1);
      expect(result.semanticRules).toEqual([]);
    });

    it("handles only semantic section", () => {
      const raw = `
===RULES_JSON===
===SEMANTIC_JSON===
{"rules": [{"id": "s1", "applies_to": ["*"], "nudge": "check"}]}
===END===`;
      const result = parseAIResult(raw);
      expect(result.rules).toEqual([]);
      expect(result.semanticRules.length).toBe(1);
    });

    it("handles malformed JSON in rules section", () => {
      const raw = `
===RULES_JSON===
{not valid json}
===SEMANTIC_JSON===
{"rules": []}
===END===`;
      const result = parseAIResult(raw);
      expect(result.rules).toEqual([]);
    });

    it("handles malformed JSON in semantic section", () => {
      const raw = `
===RULES_JSON===
{"rules": []}
===SEMANTIC_JSON===
{broken}
===END===`;
      const result = parseAIResult(raw);
      expect(result.semanticRules).toEqual([]);
    });
  });
});
