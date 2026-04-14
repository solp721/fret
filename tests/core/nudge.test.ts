import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getNudge } from "../../src/core/nudge.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fret-nudge-test-"));
  await fs.mkdir(path.join(tmpDir, ".fret"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("nudge", () => {
  it("returns empty string when no semantic-rules.json", async () => {
    const result = await getNudge("test.tsx", tmpDir);
    expect(result).toBe("");
  });

  it("returns empty string for empty rules", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".fret", "semantic-rules.json"),
      JSON.stringify({ rules: [] })
    );
    const result = await getNudge("test.tsx", tmpDir);
    expect(result).toBe("");
  });

  it("returns nudge for matching file pattern", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".fret", "semantic-rules.json"),
      JSON.stringify({
        rules: [{ id: "s1", applies_to: ["*.tsx"], nudge: "Check naming conventions" }],
      })
    );
    const result = await getNudge("Component.tsx", tmpDir);
    expect(result).toContain("Check naming conventions");
    expect(result.startsWith("[Fret]")).toBe(true);
  });

  it("returns empty for non-matching file pattern", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".fret", "semantic-rules.json"),
      JSON.stringify({
        rules: [{ id: "s1", applies_to: ["*.tsx"], nudge: "Check naming" }],
      })
    );
    const result = await getNudge("utils.ts", tmpDir);
    expect(result).toBe("");
  });

  it("combines multiple applicable nudges", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".fret", "semantic-rules.json"),
      JSON.stringify({
        rules: [
          { id: "s1", applies_to: ["*.tsx"], nudge: "Check naming" },
          { id: "s2", applies_to: ["*.tsx"], nudge: "Verify props" },
          { id: "s3", applies_to: ["*.ts"], nudge: "Skip this one" },
        ],
      })
    );
    const result = await getNudge("App.tsx", tmpDir);
    expect(result).toContain("Check naming");
    expect(result).toContain("Verify props");
    expect(result).not.toContain("Skip this one");
  });

  it("matches wildcard * pattern", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".fret", "semantic-rules.json"),
      JSON.stringify({
        rules: [{ id: "s1", applies_to: ["*"], nudge: "Universal check" }],
      })
    );
    const result = await getNudge("anything.py", tmpDir);
    expect(result).toContain("Universal check");
  });
});
