import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readConfig } from "../core/config.js";

export const auditCodeInputSchema = {
  project_root: z.string().describe("Absolute path to project root"),
  file_paths: z
    .array(z.string())
    .describe("Modified file paths to audit (relative to project root)"),
};

export async function handleAuditCode(args: {
  project_root: string;
  file_paths: string[];
}): Promise<string> {
  const config = await readConfig(args.project_root);

  if (config.conventionPaths.length === 0) {
    return "ERROR: No convention docs registered. Run set_convention_docs first.";
  }

  // 1. 컨벤션 마크다운 원문 읽기
  const conventionSections: string[] = [];
  for (const convPath of config.conventionPaths) {
    const absPath = path.resolve(args.project_root, convPath);
    try {
      const content = await fs.readFile(absPath, "utf-8");
      conventionSections.push(`### 📄 ${convPath}\n\n${content}`);
    } catch {
      conventionSections.push(`### ⚠️ ${convPath}\n\nCannot read file.`);
    }
  }

  // 2. 수정된 코드 파일 읽기
  const codeSections: string[] = [];
  for (const filePath of args.file_paths) {
    const relativePath = filePath.startsWith("/")
      ? path.relative(args.project_root, filePath)
      : filePath;
    const absPath = path.resolve(args.project_root, relativePath);
    try {
      const content = await fs.readFile(absPath, "utf-8");
      const lines = content.split("\n");
      const numbered = lines
        .map((line, i) => `${String(i + 1).padStart(4)} | ${line}`)
        .join("\n");
      codeSections.push(`### 📝 ${relativePath}\n\n\`\`\`\n${numbered}\n\`\`\``);
    } catch {
      codeSections.push(`### ⚠️ ${relativePath}\n\nCannot read file.`);
    }
  }

  // 3. 에이전트에게 반환할 구조화된 컨텍스트 조립
  return `# Fret Audit: Semantic Convention Review

You MUST review the code below against the convention documents and report ALL semantic violations that static analysis cannot catch.

Focus on these categories:
- Component declaration style (function vs arrow)
- Type declaration style (interface vs type)
- Naming conventions (PascalCase, camelCase, on/handle prefixes)
- Code organization order within components (hooks → memo → effect → handler → return)
- Props drilling depth
- State management patterns (server vs client state separation)
- Comment policy (allowed only in utility .ts files)
- Inline function usage in JSX
- Import/export patterns
- Accessibility semantics beyond div+onClick

---

## Convention Documents

${conventionSections.join("\n\n---\n\n")}

---

## Code to Audit

${codeSections.join("\n\n---\n\n")}

---

## Response Format

For each violation found, report:
- **File**: file path
- **Line**: line number(s)
- **Rule**: which convention is violated
- **Issue**: what is wrong
- **Fix**: how to fix it

If no violations are found, respond with "PASS: All files conform to conventions."`;
}
