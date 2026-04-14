#!/usr/bin/env node
import { runCLI } from "./cli/index.js";
import { runServer } from "./server/transport.js";

const command = process.argv[2];

if (command && command !== "serve") {
  runCLI().catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  });
} else {
  runServer().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
