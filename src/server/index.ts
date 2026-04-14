import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { updateRulesInputSchema, handleUpdateRules } from "../handlers/updateRules.js";
import { checkCodeInputSchema, handleCheckCode, formatResult } from "../handlers/checkCode.js";
import { setConventionDocsInputSchema, handleSetConventionDocs } from "../handlers/setConventionDocs.js";
import { auditCodeInputSchema, handleAuditCode } from "../handlers/auditCode.js";

export const server = new McpServer({
  name: "fret",
  version: "0.1.0",
});

server.registerTool(
  "update_fret_rules",
  {
    description: "Compile project convention rules from structured data into .fret/rules.json.",
    inputSchema: updateRulesInputSchema,
  },
  async (args) => ({
    content: [{ type: "text", text: await handleUpdateRules(args) }],
  })
);

server.registerTool(
  "check_code_conventions",
  {
    description: "Validate modified code files against .fret/rules.json. Returns PASS or FAIL with violation details.",
    inputSchema: checkCodeInputSchema,
  },
  async (args) => ({
    content: [{ type: "text", text: formatResult(await handleCheckCode(args)) }],
  })
);

server.registerTool(
  "set_convention_docs",
  {
    description: "Register markdown convention document paths for semantic audit.",
    inputSchema: setConventionDocsInputSchema,
  },
  async (args) => ({
    content: [{ type: "text", text: await handleSetConventionDocs(args) }],
  })
);

server.registerTool(
  "audit_code_conventions",
  {
    description: "Semantic convention audit. Returns convention docs + code for AI review.",
    inputSchema: auditCodeInputSchema,
  },
  async (args) => ({
    content: [{ type: "text", text: await handleAuditCode(args) }],
  })
);
