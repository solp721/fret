// ─── Property Value Matcher ───

export type PropValue =
  | string
  | boolean
  | number
  | { regex: string }
  | { startsWith: string }
  | { endsWith: string }
  | { exists: boolean }
  | { not: PropValue };

// ─── Node Matcher ───

export interface NodeMatcher {
  nodeType: string;
  props?: Record<string, PropValue>;
}

// ─── AST Condition (new) ───

export interface ASTCondition {
  nodeType: string;
  props?: Record<string, PropValue>;
  parent?: NodeMatcher;
  ancestor?: NodeMatcher;
  child?: NodeMatcher;
  descendant?: NodeMatcher;
}

// ─── Rules ───

export interface PathRule {
  id: string;
  type: "PATH";
  target: string;
  filePattern?: string;
  action: "BLOCK";
  message: string;
}

export interface RegexRule {
  id: string;
  type: "REGEX";
  target: string;
  filePattern?: string;
  action: "BLOCK";
  message: string;
}

export interface ASTRule {
  id: string;
  type: "AST";
  condition: ASTCondition;
  filePattern?: string;
  action: "BLOCK";
  message: string;
}

export type Rule = PathRule | RegexRule | ASTRule;

export interface RulesFile {
  rules: Rule[];
}

export interface Violation {
  ruleId: string;
  message: string;
  file: string;
  line?: number;
}

export interface CheckResult {
  pass: boolean;
  violations: Violation[];
}

// ─── Semantic Rule ───

export interface SemanticRule {
  id: string;
  applies_to: string[];
  nudge: string;
}

// ─── Handler Result ───

export type HandlerResult =
  | { status: "pass"; message: string; violations?: never }
  | { status: "fail"; message: string; violations: Violation[] }
  | { status: "error"; message: string };
