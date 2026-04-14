import fs from "node:fs/promises";
import path from "node:path";
import type { Rule } from "../types.js";

// Fret 룰 ID → ESLint 룰 매핑
const FRET_TO_ESLINT: Record<string, { rule: string; config: any; plugin?: string }> = {
  "no-var":             { rule: "no-var", config: "error" },
  "no-any-type":        { rule: "@typescript-eslint/no-explicit-any", config: "error" },
  "no-console-log":     { rule: "no-console", config: ["error", { allow: ["warn", "error"] }] },
  "no-nested-ternary":  { rule: "no-nested-ternary", config: "error" },
  "no-div-onclick":     { rule: "jsx-a11y/no-static-element-interactions", config: "error", plugin: "jsx-a11y" },
  "no-span-onclick":    { rule: "jsx-a11y/no-static-element-interactions", config: "error", plugin: "jsx-a11y" },
  "no-fire-event":      { rule: "no-restricted-imports", config: ["error", { paths: [{ name: "@testing-library/react", importNames: ["fireEvent"], message: "fret: fireEvent 지양. userEvent를 사용하세요." }] }] },
  "no-query-selector":  { rule: "no-restricted-syntax", config: ["error", { selector: "CallExpression[callee.property.name='querySelector']", message: "fret: querySelector 사용 금지. getByRole 등을 사용하세요." }] },
};

interface SyncResult {
  synced: string[];
  skipped: string[];
  needsInstall: string[];
}

export async function syncEslintConfig(root: string, rules: Rule[]): Promise<SyncResult> {
  const result: SyncResult = { synced: [], skipped: [], needsInstall: [] };

  // ESLint 설정 파일 찾기 (JSON만 지원)
  const configPath = path.join(root, ".eslintrc.json");
  let rawContent: string;
  try {
    rawContent = await fs.readFile(configPath, "utf-8");
  } catch {
    result.skipped.push("No .eslintrc.json found");
    return result;
  }

  // JSON with comments → 주석 제거 후 파싱
  const jsonClean = rawContent
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  let config: any;
  try {
    config = JSON.parse(jsonClean);
  } catch {
    result.skipped.push("Failed to parse .eslintrc.json");
    return result;
  }

  if (!config.rules) config.rules = {};
  if (!config.plugins) config.plugins = [];

  let changed = false;

  for (const rule of rules) {
    const mapping = FRET_TO_ESLINT[rule.id];
    if (!mapping) {
      result.skipped.push(rule.id);
      continue;
    }

    // 이미 동일하면 스킵
    const existing = config.rules[mapping.rule];
    if (JSON.stringify(existing) === JSON.stringify(mapping.config)) {
      result.synced.push(`${rule.id} (already set)`);
      continue;
    }

    config.rules[mapping.rule] = mapping.config;
    result.synced.push(rule.id);
    changed = true;

    // 플러그인 필요 시 추가
    if (mapping.plugin && !config.plugins.includes(mapping.plugin)) {
      config.plugins.push(mapping.plugin);

      // 설치 필요 여부
      try {
        const pkgJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf-8"));
        const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
        if (!allDeps[`eslint-plugin-${mapping.plugin}`]) {
          result.needsInstall.push(`eslint-plugin-${mapping.plugin}`);
        }
      } catch { /* skip */ }
    }
  }

  if (changed) {
    // 깨끗한 JSON으로 재작성 (주석은 사라짐 — 안전한 방법)
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  }

  return result;
}
