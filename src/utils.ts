/** Fret shared utilities */

export const FRET_DIR = ".fret";

export const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs",
]);

export function isCodeFile(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return false;
  return CODE_EXTENSIONS.has(filePath.substring(dot));
}

export function matchFilePattern(filePath: string, pattern: string): boolean {
  if (pattern.startsWith("**/")) {
    return filePath.endsWith(pattern.substring(2));
  }
  if (pattern.startsWith("*.")) {
    return filePath.endsWith(pattern.substring(1));
  }
  if (pattern.startsWith("*")) {
    return filePath.endsWith(pattern.substring(1));
  }
  return filePath.includes(pattern);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function getExtension(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot === -1 ? "" : filePath.substring(dot);
}
