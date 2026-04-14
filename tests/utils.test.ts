import { describe, it, expect } from "vitest";
import { isCodeFile, matchFilePattern, getExtension, CODE_EXTENSIONS } from "../src/utils.js";

describe("utils", () => {
  describe("isCodeFile", () => {
    it("accepts .ts files", () => {
      expect(isCodeFile("app.ts")).toBe(true);
    });

    it("accepts .tsx files", () => {
      expect(isCodeFile("Component.tsx")).toBe(true);
    });

    it("accepts .js files", () => {
      expect(isCodeFile("index.js")).toBe(true);
    });

    it("accepts .jsx files", () => {
      expect(isCodeFile("App.jsx")).toBe(true);
    });

    it("accepts .mts files", () => {
      expect(isCodeFile("config.mts")).toBe(true);
    });

    it("accepts .mjs files", () => {
      expect(isCodeFile("utils.mjs")).toBe(true);
    });

    it("rejects .json files", () => {
      expect(isCodeFile("package.json")).toBe(false);
    });

    it("rejects .md files", () => {
      expect(isCodeFile("README.md")).toBe(false);
    });

    it("rejects .css files", () => {
      expect(isCodeFile("styles.css")).toBe(false);
    });

    it("rejects files with no extension", () => {
      expect(isCodeFile("Makefile")).toBe(false);
    });

    it("handles paths with directories", () => {
      expect(isCodeFile("src/components/Button.tsx")).toBe(true);
    });

    it("handles dotfiles", () => {
      expect(isCodeFile(".eslintrc")).toBe(false);
    });
  });

  describe("matchFilePattern", () => {
    it("matches *.tsx pattern", () => {
      expect(matchFilePattern("Component.tsx", "*.tsx")).toBe(true);
    });

    it("does not match wrong extension", () => {
      expect(matchFilePattern("app.ts", "*.tsx")).toBe(false);
    });

    it("matches **/ prefix pattern", () => {
      expect(matchFilePattern("src/components/Button.tsx", "**/Button.tsx")).toBe(true);
    });

    it("matches * prefix pattern", () => {
      expect(matchFilePattern("test.spec.ts", "*.spec.ts")).toBe(true);
    });

    it("matches substring includes", () => {
      expect(matchFilePattern("src/utils/helpers.ts", "utils")).toBe(true);
    });

    it("does not match unrelated substring", () => {
      expect(matchFilePattern("src/components/App.tsx", "utils")).toBe(false);
    });

    it("matches nested paths with *.ext", () => {
      expect(matchFilePattern("src/deep/nested/file.tsx", "*.tsx")).toBe(true);
    });
  });

  describe("getExtension", () => {
    it("returns .ts for TypeScript files", () => {
      expect(getExtension("app.ts")).toBe(".ts");
    });

    it("returns .tsx for TSX files", () => {
      expect(getExtension("Component.tsx")).toBe(".tsx");
    });

    it("returns empty string for no extension", () => {
      expect(getExtension("Makefile")).toBe("");
    });

    it("returns last extension for multiple dots", () => {
      expect(getExtension("app.test.ts")).toBe(".ts");
    });

    it("handles paths with directories", () => {
      expect(getExtension("src/utils/helpers.ts")).toBe(".ts");
    });
  });

  describe("CODE_EXTENSIONS", () => {
    it("contains all expected extensions", () => {
      expect(CODE_EXTENSIONS.has(".ts")).toBe(true);
      expect(CODE_EXTENSIONS.has(".tsx")).toBe(true);
      expect(CODE_EXTENSIONS.has(".js")).toBe(true);
      expect(CODE_EXTENSIONS.has(".jsx")).toBe(true);
      expect(CODE_EXTENSIONS.has(".mts")).toBe(true);
      expect(CODE_EXTENSIONS.has(".mjs")).toBe(true);
    });

    it("does not contain non-code extensions", () => {
      expect(CODE_EXTENSIONS.has(".json")).toBe(false);
      expect(CODE_EXTENSIONS.has(".css")).toBe(false);
      expect(CODE_EXTENSIONS.has(".md")).toBe(false);
    });
  });
});
