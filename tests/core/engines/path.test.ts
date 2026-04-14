import { describe, it, expect } from "vitest";
import { checkPath } from "../../../src/core/engines/path.js";
import type { PathRule } from "../../../src/types.js";

function makeRule(target: string): PathRule {
  return { id: "test", type: "PATH", target, action: "BLOCK", message: "test" };
}

describe("PATH Engine", () => {
  it("blocks matching path", () => {
    const rule = makeRule("^migrations/");
    expect(checkPath(rule, "migrations/001.sql")).not.toBeNull();
  });

  it("allows non-matching path", () => {
    const rule = makeRule("^migrations/");
    expect(checkPath(rule, "src/app.ts")).toBeNull();
  });

  it("matches complex regex", () => {
    const rule = makeRule("\\.(env|secret)$");
    expect(checkPath(rule, "config/.env")).not.toBeNull();
    expect(checkPath(rule, "keys.secret")).not.toBeNull();
    expect(checkPath(rule, "app.ts")).toBeNull();
  });

  it("handles invalid regex gracefully", () => {
    const rule = makeRule("[invalid(");
    expect(checkPath(rule, "any/path")).toBeNull();
  });

  it("includes file path in violation", () => {
    const rule = makeRule("^dist/");
    const v = checkPath(rule, "dist/bundle.js");
    expect(v?.file).toBe("dist/bundle.js");
  });
});
