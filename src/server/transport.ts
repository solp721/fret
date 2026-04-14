import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { server } from "./index.js";

export async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Fret MCP server running on stdio");
}
