import { parse, type ParserPlugin } from "@babel/parser";
import traverse from "@babel/traverse";
import type { Node } from "@babel/types";
import type { ASTRule, ASTCondition, NodeMatcher, PropValue, Violation } from "../../types.js";
import { CODE_EXTENSIONS, matchFilePattern, getExtension } from "../../utils.js";

function getPlugins(ext: string): ParserPlugin[] {
  const plugins: ParserPlugin[] = ["decorators-legacy"];
  if (ext === ".ts" || ext === ".tsx" || ext === ".mts") plugins.push("typescript");
  if (ext === ".jsx" || ext === ".tsx" || ext === ".js" || ext === ".mjs") plugins.push("jsx");
  return plugins;
}

// ─── Dot-path property resolution ───

function resolveDotPath(obj: any, dotPath: string): any[] {
  const parts = dotPath.split(".");
  let current: any[] = [obj];

  for (const part of parts) {
    const next: any[] = [];
    for (const item of current) {
      if (item == null) continue;
      if (Array.isArray(item)) {
        // arrays: check each element
        for (const el of item) {
          if (el != null && el[part] !== undefined) {
            next.push(el[part]);
          }
        }
      } else if (typeof item === "object" && item[part] !== undefined) {
        next.push(item[part]);
      }
    }
    current = next;
    if (current.length === 0) return [];
  }

  return current;
}

// ─── PropValue matching ───

function matchPropValue(actual: any, matcher: PropValue): boolean {
  if (actual === undefined || actual === null) {
    // "exists" check
    if (typeof matcher === "object" && matcher !== null && "exists" in matcher) {
      return !matcher.exists; // exists:false → matches when not found
    }
    return false;
  }

  // Primitive exact match
  if (typeof matcher === "string") return String(actual) === matcher;
  if (typeof matcher === "boolean") return actual === matcher;
  if (typeof matcher === "number") return actual === matcher;

  // Object matchers
  if (typeof matcher === "object" && matcher !== null) {
    if ("regex" in matcher) {
      try {
        return new RegExp(matcher.regex).test(String(actual));
      } catch { return false; }
    }
    if ("startsWith" in matcher) return String(actual).startsWith(matcher.startsWith);
    if ("endsWith" in matcher) return String(actual).endsWith(matcher.endsWith);
    if ("exists" in matcher) return matcher.exists; // actual exists and exists:true → match
    if ("not" in matcher) return !matchPropValue(actual, matcher.not);
  }

  return false;
}

// ─── Node matching ───

function matchProps(node: any, props: Record<string, PropValue>): boolean {
  for (const [dotPath, matcher] of Object.entries(props)) {
    const values = resolveDotPath(node, dotPath);

    if (typeof matcher === "object" && matcher !== null && "exists" in matcher) {
      const found = values.length > 0;
      if (found !== matcher.exists) return false;
      continue;
    }

    // At least one resolved value must match
    const anyMatch = values.some((v) => matchPropValue(v, matcher));
    if (!anyMatch) return false;
  }
  return true;
}

function matchNodeMatcher(node: Node, matcher: NodeMatcher): boolean {
  if (node.type !== matcher.nodeType) return false;
  if (matcher.props && !matchProps(node, matcher.props)) return false;
  return true;
}

// ─── Structural relationship checks ───

function checkParent(path: any, matcher: NodeMatcher): boolean {
  const parentPath = path.parentPath;
  if (!parentPath) return false;
  return matchNodeMatcher(parentPath.node, matcher);
}

function checkAncestor(path: any, matcher: NodeMatcher): boolean {
  let current = path.parentPath;
  while (current) {
    if (matchNodeMatcher(current.node, matcher)) return true;
    current = current.parentPath;
  }
  return false;
}

function checkChild(node: Node, matcher: NodeMatcher): boolean {
  // Check direct children of the node
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "loc" || key === "start" || key === "end") continue;
    const value = (node as any)[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && item.type && matchNodeMatcher(item, matcher)) {
          return true;
        }
      }
    } else if (value && typeof value === "object" && value.type) {
      if (matchNodeMatcher(value, matcher)) return true;
    }
  }
  return false;
}

function checkDescendant(path: any, matcher: NodeMatcher): boolean {
  let found = false;
  path.traverse({
    enter(innerPath: any) {
      if (found) { innerPath.stop(); return; }
      if (matchNodeMatcher(innerPath.node, matcher)) {
        found = true;
        innerPath.stop();
      }
    },
  });
  return found;
}

// ─── Condition evaluation ───

function evaluateCondition(path: any, condition: ASTCondition): boolean {
  // 1. Node type must match
  if (path.node.type !== condition.nodeType) return false;

  // 2. Props must match
  if (condition.props && !matchProps(path.node, condition.props)) return false;

  // 3. Structural relationships
  if (condition.parent && !checkParent(path, condition.parent)) return false;
  if (condition.ancestor && !checkAncestor(path, condition.ancestor)) return false;
  if (condition.child && !checkChild(path.node, condition.child)) return false;
  if (condition.descendant && !checkDescendant(path, condition.descendant)) return false;

  return true;
}

// ─── Main entry point ───

export function checkASTBatch(
  rules: ASTRule[],
  filePath: string,
  content: string
): Violation[] {
  const ext = getExtension(filePath);
  if (!CODE_EXTENSIONS.has(ext)) return [];
  if (rules.length === 0) return [];

  // Filter rules by filePattern
  const applicableRules = rules.filter((r) => {
    if (!r.filePattern) return true;
    return matchFilePattern(filePath, r.filePattern);
  });
  if (applicableRules.length === 0) return [];

  const violations: Violation[] = [];

  try {
    const ast = parse(content, {
      sourceType: "module",
      plugins: getPlugins(ext),
      errorRecovery: true,
    });

    const traverseFn = (traverse as any).default ?? traverse;

    // Collect unique nodeTypes needed
    const nodeTypes = new Set(applicableRules.map((r) => r.condition.nodeType));

    // Handle special "Comment" nodeType
    if (nodeTypes.has("Comment")) {
      const commentRules = applicableRules.filter((r) => r.condition.nodeType === "Comment");
      if (ast.comments && ast.comments.length > 0) {
        for (const comment of ast.comments) {
          for (const rule of commentRules) {
            // If props are specified, check them; otherwise just existing = violation
            if (!rule.condition.props || matchProps(comment, rule.condition.props)) {
              violations.push({
                ruleId: rule.id,
                message: rule.message,
                file: filePath,
                line: comment.loc?.start.line,
              });
            }
          }
        }
      }
      nodeTypes.delete("Comment");
    }

    // Build visitor for remaining nodeTypes
    const visitor: Record<string, (path: any) => void> = {};

    for (const nodeType of nodeTypes) {
      const nodeRules = applicableRules.filter(
        (r) => r.condition.nodeType === nodeType
      );

      visitor[nodeType] = (path: any) => {
        for (const rule of nodeRules) {
          if (evaluateCondition(path, rule.condition)) {
            violations.push({
              ruleId: rule.id,
              message: rule.message,
              file: filePath,
              line: path.node.loc?.start.line,
            });
          }
        }
      };
    }

    if (Object.keys(visitor).length > 0) {
      traverseFn(ast, visitor);
    }
  } catch (error) {
    violations.push({
      ruleId: "SYNTAX_ERROR",
      message: `AST parse error: ${error instanceof Error ? error.message : String(error)}`,
      file: filePath,
    });
  }

  return violations;
}
