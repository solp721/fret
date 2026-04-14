import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readConfig, writeConfig } from "../../src/core/config.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fret-config-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("config", () => {
  describe("readConfig", () => {
    it("returns default config when no file exists", async () => {
      const config = await readConfig(tmpDir);
      expect(config.conventionPaths).toEqual([]);
    });

    it("reads existing config", async () => {
      await fs.mkdir(path.join(tmpDir, ".fret"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, ".fret", "config.json"),
        JSON.stringify({ conventionPaths: ["docs/conventions.md"] })
      );
      const config = await readConfig(tmpDir);
      expect(config.conventionPaths).toEqual(["docs/conventions.md"]);
    });

    it("merges with defaults for partial config", async () => {
      await fs.mkdir(path.join(tmpDir, ".fret"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, ".fret", "config.json"),
        JSON.stringify({})
      );
      const config = await readConfig(tmpDir);
      expect(config.conventionPaths).toEqual([]);
    });
  });

  describe("writeConfig", () => {
    it("creates .fret dir and writes config", async () => {
      await writeConfig(tmpDir, { conventionPaths: ["a.md", "b.md"] });
      const content = await fs.readFile(path.join(tmpDir, ".fret", "config.json"), "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.conventionPaths).toEqual(["a.md", "b.md"]);
    });

    it("overwrites existing config", async () => {
      await writeConfig(tmpDir, { conventionPaths: ["old.md"] });
      await writeConfig(tmpDir, { conventionPaths: ["new.md"] });
      const config = await readConfig(tmpDir);
      expect(config.conventionPaths).toEqual(["new.md"]);
    });
  });
});
