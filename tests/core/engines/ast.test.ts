import { describe, it, expect } from "vitest";
import { checkASTBatch } from "../../../src/core/engines/ast.js";
import type { ASTRule } from "../../../src/types.js";

function makeRule(override: Partial<ASTRule> & { condition: ASTRule["condition"] }): ASTRule {
  return { id: "test", type: "AST", action: "BLOCK", message: "test", ...override };
}

describe("AST Engine", () => {
  describe("props dot-path matching", () => {
    it("matches JSXOpeningElement by name", () => {
      const rules: ASTRule[] = [
        makeRule({
          condition: { nodeType: "JSXOpeningElement", props: { "name.name": "div" } },
        }),
      ];
      const code = `const x = () => <div>hello</div>;`;
      const violations = checkASTBatch(rules, "test.tsx", code);
      expect(violations.length).toBe(1);
    });

    it("matches JSXOpeningElement with attribute", () => {
      const rules: ASTRule[] = [
        makeRule({
          condition: {
            nodeType: "JSXOpeningElement",
            props: { "name.name": "div", "attributes.name.name": "onClick" },
          },
        }),
      ];
      const code = `const x = () => <div onClick={() => {}}>hello</div>;`;
      const violations = checkASTBatch(rules, "test.tsx", code);
      expect(violations.length).toBe(1);
    });

    it("does not match when attribute is absent", () => {
      const rules: ASTRule[] = [
        makeRule({
          condition: {
            nodeType: "JSXOpeningElement",
            props: { "name.name": "div", "attributes.name.name": "onClick" },
          },
        }),
      ];
      const code = `const x = () => <div className="a">hello</div>;`;
      const violations = checkASTBatch(rules, "test.tsx", code);
      expect(violations.length).toBe(0);
    });
  });

  describe("PropValue matchers", () => {
    it("matches regex", () => {
      const rules: ASTRule[] = [
        makeRule({
          condition: {
            nodeType: "JSXAttribute",
            props: { "name.name": { regex: "^on[A-Z]" } },
          },
        }),
      ];
      const code = `const x = () => <button onClick={() => {}} onHover={() => {}}>ok</button>;`;
      const violations = checkASTBatch(rules, "test.tsx", code);
      expect(violations.length).toBe(2);
    });

    it("matches startsWith", () => {
      const rules: ASTRule[] = [
        makeRule({
          condition: {
            nodeType: "FunctionDeclaration",
            props: { "id.name": { startsWith: "use" } },
          },
        }),
      ];
      const code = `function useMyHook() { return 1; }`;
      const violations = checkASTBatch(rules, "test.ts", code);
      expect(violations.length).toBe(1);
    });

    it("matches not + startsWith", () => {
      const rules: ASTRule[] = [
        makeRule({
          condition: {
            nodeType: "FunctionDeclaration",
            props: { "id.name": { not: { startsWith: "handle" } } },
          },
        }),
      ];
      const code = `function handleClick() {} function doSomething() {}`;
      const violations = checkASTBatch(rules, "test.ts", code);
      // doSomething은 handle로 시작 안 함 → 위반
      expect(violations.length).toBe(1);
    });
  });

  describe("structural relationships", () => {
    it("ancestor: arrow function in JSXExpressionContainer", () => {
      const rules: ASTRule[] = [
        makeRule({
          condition: {
            nodeType: "ArrowFunctionExpression",
            ancestor: { nodeType: "JSXExpressionContainer" },
          },
        }),
      ];
      const code = `const x = () => <button onClick={() => alert("hi")}>ok</button>;`;
      const violations = checkASTBatch(rules, "test.tsx", code);
      expect(violations.length).toBeGreaterThanOrEqual(1);
    });

    it("child: TSTypeAliasDeclaration with TSTypeLiteral child", () => {
      const rules: ASTRule[] = [
        makeRule({
          condition: {
            nodeType: "TSTypeAliasDeclaration",
            child: { nodeType: "TSTypeLiteral" },
          },
        }),
      ];
      const code = `type Props = { name: string; age: number };`;
      const violations = checkASTBatch(rules, "test.ts", code);
      expect(violations.length).toBe(1);
    });

    it("child: does not match when child is different", () => {
      const rules: ASTRule[] = [
        makeRule({
          condition: {
            nodeType: "TSTypeAliasDeclaration",
            child: { nodeType: "TSTypeLiteral" },
          },
        }),
      ];
      // union type, not object literal
      const code = `type Status = "active" | "inactive";`;
      const violations = checkASTBatch(rules, "test.ts", code);
      expect(violations.length).toBe(0);
    });

    it("ancestor: nested ternary", () => {
      const rules: ASTRule[] = [
        makeRule({
          condition: {
            nodeType: "ConditionalExpression",
            ancestor: { nodeType: "ConditionalExpression" },
          },
        }),
      ];
      const code = `const x = a > 1 ? "big" : a > 0 ? "small" : "zero";`;
      const violations = checkASTBatch(rules, "test.ts", code);
      expect(violations.length).toBe(1);
    });

    it("no match for non-nested ternary", () => {
      const rules: ASTRule[] = [
        makeRule({
          condition: {
            nodeType: "ConditionalExpression",
            ancestor: { nodeType: "ConditionalExpression" },
          },
        }),
      ];
      const code = `const x = a > 1 ? "big" : "small";`;
      const violations = checkASTBatch(rules, "test.ts", code);
      expect(violations.length).toBe(0);
    });
  });

  describe("Comment detection", () => {
    it("detects comments in .tsx", () => {
      const rules: ASTRule[] = [
        makeRule({ condition: { nodeType: "Comment" }, filePattern: "*.tsx" }),
      ];
      const code = `// this is a comment\nconst x = 1;`;
      const violations = checkASTBatch(rules, "test.tsx", code);
      expect(violations.length).toBe(1);
    });

    it("skips comments when filePattern doesn't match", () => {
      const rules: ASTRule[] = [
        makeRule({ condition: { nodeType: "Comment" }, filePattern: "*.tsx" }),
      ];
      const code = `// this is a comment\nconst x = 1;`;
      const violations = checkASTBatch(rules, "test.ts", code);
      expect(violations.length).toBe(0);
    });
  });

  describe("filePattern filtering", () => {
    it("applies rule only to matching files", () => {
      const rules: ASTRule[] = [
        makeRule({
          condition: { nodeType: "JSXOpeningElement", props: { "name.name": "div" } },
          filePattern: "*.tsx",
        }),
      ];
      const code = `const x = () => <div>hello</div>;`;

      expect(checkASTBatch(rules, "test.tsx", code).length).toBe(1);
      expect(checkASTBatch(rules, "test.ts", code).length).toBe(0);
    });
  });

  describe("error handling", () => {
    it("returns SYNTAX_ERROR for unparseable code", () => {
      const rules: ASTRule[] = [
        makeRule({ condition: { nodeType: "JSXOpeningElement" } }),
      ];
      const code = `const x = @@@;`;
      const violations = checkASTBatch(rules, "test.ts", code);
      expect(violations.some((v) => v.ruleId === "SYNTAX_ERROR")).toBe(true);
    });

    it("skips non-JS files", () => {
      const rules: ASTRule[] = [
        makeRule({ condition: { nodeType: "JSXOpeningElement" } }),
      ];
      const violations = checkASTBatch(rules, "test.json", '{"a":1}');
      expect(violations.length).toBe(0);
    });

    it("handles empty rule array", () => {
      const violations = checkASTBatch([], "test.tsx", "const x = 1;");
      expect(violations.length).toBe(0);
    });
  });
});
