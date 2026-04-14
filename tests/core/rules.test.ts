import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readRules, writeRules } from "../../src/core/rules.js";
import type { RulesFile } from "../../src/types.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fret-rules-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("rules", () => {
  describe("readRules", () => {
    it("returns null when no rules file exists", async () => {
      const rules = await readRules(tmpDir);
      expect(rules).toBeNull();
    });

    it("reads existing rules file", async () => {
      await fs.mkdir(path.join(tmpDir, ".fret"), { recursive: true });
      const rulesFile: RulesFile = {
        rules: [{ id: "no-var", type: "REGEX", target: "\\bvar\\s", action: "BLOCK", message: "no var" }],
      };
      await fs.writeFile(
        path.join(tmpDir, ".fret", "rules.json"),
        JSON.stringify(rulesFile)
      );
      const result = await readRules(tmpDir);
      expect(result?.rules.length).toBe(1);
      expect(result?.rules[0].id).toBe("no-var");
    });

    it("reads empty rules array", async () => {
      await fs.mkdir(path.join(tmpDir, ".fret"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, ".fret", "rules.json"),
        JSON.stringify({ rules: [] })
      );
      const result = await readRules(tmpDir);
      expect(result?.rules).toEqual([]);
    });
  });

  describe("writeRules", () => {
    it("creates .fret dir and writes rules", async () => {
      const rulesFile: RulesFile = {
        rules: [{ id: "r1", type: "PATH", target: "^dist/", action: "BLOCK", message: "no dist" }],
      };
      await writeRules(tmpDir, rulesFile);
      const content = await fs.readFile(path.join(tmpDir, ".fret", "rules.json"), "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.rules[0].id).toBe("r1");
    });

    it("overwrites existing rules", async () => {
      await writeRules(tmpDir, { rules: [{ id: "old", type: "REGEX", target: "x", action: "BLOCK", message: "m" }] });
      await writeRules(tmpDir, { rules: [{ id: "new", type: "REGEX", target: "y", action: "BLOCK", message: "n" }] });
      const result = await readRules(tmpDir);
      expect(result?.rules.length).toBe(1);
      expect(result?.rules[0].id).toBe("new");
    });

    it("writes multiple rule types", async () => {
      const rulesFile: RulesFile = {
        rules: [
          { id: "r1", type: "PATH", target: "^dist/", action: "BLOCK", message: "m1" },
          { id: "r2", type: "REGEX", target: "\\bvar\\s", action: "BLOCK", message: "m2" },
          { id: "r3", type: "AST", condition: { nodeType: "Comment" }, action: "BLOCK", message: "m3" },
        ],
      };
      await writeRules(tmpDir, rulesFile);
      const result = await readRules(tmpDir);
      expect(result?.rules.length).toBe(3);
    });
  });
});
