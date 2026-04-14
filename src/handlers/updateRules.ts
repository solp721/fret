import { z } from "zod";
import { writeRules } from "../core/rules.js";
import type { RulesFile } from "../types.js";

// PropValue: recursive via z.lazy
const PropValueSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    z.string(),
    z.boolean(),
    z.number(),
    z.object({ regex: z.string() }),
    z.object({ startsWith: z.string() }),
    z.object({ endsWith: z.string() }),
    z.object({ exists: z.boolean() }),
    z.object({ not: PropValueSchema }),
  ])
);

const NodeMatcherSchema = z.object({
  nodeType: z.string(),
  props: z.record(PropValueSchema).optional(),
});

const ASTConditionSchema = z.object({
  nodeType: z.string(),
  props: z.record(PropValueSchema).optional(),
  parent: NodeMatcherSchema.optional(),
  ancestor: NodeMatcherSchema.optional(),
  child: NodeMatcherSchema.optional(),
  descendant: NodeMatcherSchema.optional(),
});

const PathRuleSchema = z.object({
  id: z.string(),
  type: z.literal("PATH"),
  target: z.string(),
  filePattern: z.string().optional(),
  action: z.literal("BLOCK"),
  message: z.string(),
});

const RegexRuleSchema = z.object({
  id: z.string(),
  type: z.literal("REGEX"),
  target: z.string(),
  filePattern: z.string().optional(),
  action: z.literal("BLOCK"),
  message: z.string(),
});

const ASTRuleSchema = z.object({
  id: z.string(),
  type: z.literal("AST"),
  condition: ASTConditionSchema,
  filePattern: z.string().optional(),
  action: z.literal("BLOCK"),
  message: z.string(),
});

const RuleSchema = z.discriminatedUnion("type", [
  PathRuleSchema,
  RegexRuleSchema,
  ASTRuleSchema,
]);

export const updateRulesInputSchema = {
  project_root: z.string().describe("Absolute path to project root"),
  rules: z.array(RuleSchema).describe("Array of convention rules"),
};

export async function handleUpdateRules(args: {
  project_root: string;
  rules: z.infer<typeof RuleSchema>[];
}): Promise<string> {
  const rulesFile: RulesFile = { rules: args.rules };
  await writeRules(args.project_root, rulesFile);
  return `Successfully compiled ${args.rules.length} rule(s) to ${args.project_root}/.fret/rules.json`;
}
