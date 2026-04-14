import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { handleCheckCode } from "../../src/handlers/checkCode.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fret-test-"));
  await fs.mkdir(path.join(tmpDir, ".fret"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeRulesFile(rules: any[]) {
  await fs.writeFile(
    path.join(tmpDir, ".fret", "rules.json"),
    JSON.stringify({ rules }, null, 2)
  );
}

async function writeFile(name: string, content: string) {
  const filePath = path.join(tmpDir, name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

describe("checkCode handler", () => {
  it("returns error when no rules.json", async () => {
    await fs.rm(path.join(tmpDir, ".fret", "rules.json"), { force: true });
    const result = await handleCheckCode({ project_root: tmpDir, file_paths: ["test.ts"] });
    expect(result.status).toBe("error");
  });

  it("passes with no violations", async () => {
    await writeRulesFile([{ id: "no-var", type: "REGEX", target: "\\bvar\\s", action: "BLOCK", message: "no var" }]);
    await writeFile("test.ts", "const x = 1;");
    const result = await handleCheckCode({ project_root: tmpDir, file_paths: ["test.ts"] });
    expect(result.status).toBe("pass");
  });

  it("fails with REGEX violation", async () => {
    await writeRulesFile([{ id: "no-var", type: "REGEX", target: "\\bvar\\s", action: "BLOCK", message: "no var" }]);
    await writeFile("test.ts", "var x = 1;");
    const result = await handleCheckCode({ project_root: tmpDir, file_paths: ["test.ts"] });
    expect(result.status).toBe("fail");
    expect(result.violations?.some((v) => v.ruleId === "no-var")).toBe(true);
  });

  it("fails with PATH violation", async () => {
    await writeRulesFile([{ id: "no-migration", type: "PATH", target: "^migrations/", action: "BLOCK", message: "blocked" }]);
    await writeFile("migrations/001.sql", "ALTER TABLE x;");
    const result = await handleCheckCode({ project_root: tmpDir, file_paths: ["migrations/001.sql"] });
    expect(result.status).toBe("fail");
    expect(result.violations?.some((v) => v.ruleId === "no-migration")).toBe(true);
  });

  it("fails with AST violation", async () => {
    await writeRulesFile([{
      id: "no-div-click",
      type: "AST",
      condition: { nodeType: "JSXOpeningElement", props: { "name.name": "div", "attributes.name.name": "onClick" } },
      action: "BLOCK",
      message: "no div onclick",
    }]);
    await writeFile("test.tsx", 'const x = () => <div onClick={() => {}}>hi</div>;');
    const result = await handleCheckCode({ project_root: tmpDir, file_paths: ["test.tsx"] });
    expect(result.status).toBe("fail");
    expect(result.violations?.some((v) => v.ruleId === "no-div-click")).toBe(true);
  });

  it("respects filePattern", async () => {
    await writeRulesFile([{
      id: "tsx-only",
      type: "REGEX",
      target: "console\\.log",
      filePattern: "*.tsx",
      action: "BLOCK",
      message: "no console in tsx",
    }]);
    await writeFile("app.tsx", 'console.log("a");');
    await writeFile("util.ts", 'console.log("b");');

    const tsxResult = await handleCheckCode({ project_root: tmpDir, file_paths: ["app.tsx"] });
    const tsResult = await handleCheckCode({ project_root: tmpDir, file_paths: ["util.ts"] });

    expect(tsxResult.status).toBe("fail");
    expect(tsResult.status).toBe("pass");
  });

  it("handles missing file gracefully", async () => {
    await writeRulesFile([{ id: "r1", type: "REGEX", target: "x", action: "BLOCK", message: "m" }]);
    const result = await handleCheckCode({ project_root: tmpDir, file_paths: ["nonexistent.ts"] });
    expect(result.status).toBe("fail");
    expect(result.violations?.some((v) => v.ruleId === "SYSTEM")).toBe(true);
  });

  it("checks multiple files", async () => {
    await writeRulesFile([{ id: "no-var", type: "REGEX", target: "\\bvar\\s", action: "BLOCK", message: "no var" }]);
    await writeFile("a.ts", "var x = 1;");
    await writeFile("b.ts", "const y = 2;");
    const result = await handleCheckCode({ project_root: tmpDir, file_paths: ["a.ts", "b.ts"] });
    expect(result.status).toBe("fail");
    expect(result.violations?.length).toBe(1);
  });
});
