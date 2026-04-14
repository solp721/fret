# FRET

> **Fret** is a static analysis linter that automatically enforces project conventions when coding with **Claude Code**. It hooks into the agent's tool-use lifecycle to catch violations in real time, under 200ms.

### 🔍 The Problem

When developing with AI agents like Claude Code, maintaining coding conventions is surprisingly difficult.

* **Documentation doesn't stick.** Conventions written in markdown files are easily ignored or forgotten as context grows.
* **Prompting is manual and inconsistent.** Repeating "follow this rule" every time doesn't scale.
* **Post-hoc AI review adds cost.** Running another LLM pass for validation means extra tokens and latency.

### 💡 The Solution

Fret hooks into Claude Code's **PostToolUse hook** to run local static analysis every time the agent modifies a file. Violations are reported via stdout, and the agent receives them as feedback.

* **Pure local at runtime.** Three engines (PATH, REGEX, AST) run static analysis locally. No LLM calls during checks.
* **Automatic setup.** `fret init` scans your project for convention docs, compiles rules, registers hooks, and syncs with ESLint.
* **Three-layer defense.** Fret hook catches agent violations, ESLint covers manual edits, and `fret check` provides CLI-level verification.

### 🚀 Quick Start

```bash
# Install from source (npm publish coming soon)
git clone https://github.com/solp721/fret.git
cd fret && npm install && npm run build && npm link

# Initialize in your project
cd my-project
fret init
# Restart Claude Code — auto-check is now active.
```

### ⚙️ How It Works

```
Agent writes/edits a file
        │
        ▼
PostToolUse Hook → fret check <file>
        │
        ├── PASS → proceed to next task
        │
        └── FAIL → violations reported via stdout
                    → agent receives feedback
```

### 🛠️ Static Analysis Engines

Fret uses three engines to validate code. Each rule is assigned to one engine based on what it checks.

#### PATH — File Path Blocking

Matches file paths against regex patterns. Used to prevent modifications to protected directories.

```json
{
  "type": "PATH",
  "target": "^migrations/",
  "message": "Migration files are read-only"
}
```

- `target` is a regex tested against the file's relative path.
- No file content is read — only the path is checked.

#### REGEX — Content Pattern Matching

Scans file content line by line against regex patterns. Reports the exact line number of each match.

```json
{
  "type": "REGEX",
  "target": "\\bvar\\s",
  "filePattern": "*.ts",
  "message": "Use const/let instead of var"
}
```

- `target` is a regex with global + multiline flags.
- `filePattern` (optional) limits which files the rule applies to.

#### AST — Structural Code Analysis

Parses source code into an AST using Babel and checks structural conditions. This is the most powerful engine — it can express rules that regex cannot.

```json
{
  "type": "AST",
  "condition": {
    "nodeType": "ArrowFunctionExpression",
    "ancestor": { "nodeType": "JSXExpressionContainer" }
  },
  "filePattern": "*.tsx",
  "message": "No inline arrow functions in JSX"
}
```

- `nodeType` — the Babel AST node type to match.
- `props` — dot-path property matching. Arrays use "any" semantics (at least one element must match).
  - Supports exact strings, `{ regex }`, `{ startsWith }`, `{ endsWith }`, `{ exists }`, `{ not }`.
- `parent` / `ancestor` / `child` / `descendant` — structural relationship checks.
- `filePattern` — restrict the rule to specific file extensions.
- `Comment` — special nodeType that checks `ast.comments` directly.

Supported file types: `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.mjs`.

### 📦 CLI

```bash
fret init                    # Project setup (scan → compile → hook → ESLint)
fret check                   # Check git-changed files
fret check src/App.tsx       # Check specific file
fret watch                   # Watch mode — auto-check on save
fret status                  # Show current config & rules
fret serve                   # MCP server mode (stdio)
```

### 📄 License

MIT
