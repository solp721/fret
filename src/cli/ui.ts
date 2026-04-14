// ANSI color helpers — zero dependencies
const noColor = !!process.env["NO_COLOR"] || !process.stdout.isTTY;
const esc = (code: string) => (noColor ? "" : `\x1b[${code}m`);
const reset = noColor ? "" : "\x1b[0m";

export const c = {
  bold: (s: string) => `${esc("1")}${s}${reset}`,
  dim: (s: string) => `${esc("2")}${s}${reset}`,
  green: (s: string) => `${esc("32")}${s}${reset}`,
  red: (s: string) => `${esc("31")}${s}${reset}`,
  yellow: (s: string) => `${esc("33")}${s}${reset}`,
  cyan: (s: string) => `${esc("36")}${s}${reset}`,
  magenta: (s: string) => `${esc("35")}${s}${reset}`,
  gray: (s: string) => `${esc("90")}${s}${reset}`,
  white: (s: string) => `${esc("97")}${s}${reset}`,
  bgGreen: (s: string) => `${esc("42")}${esc("30")} ${s} ${reset}`,
  bgRed: (s: string) => `${esc("41")}${esc("97")} ${s} ${reset}`,
  bgCyan: (s: string) => `${esc("46")}${esc("30")} ${s} ${reset}`,
  bgYellow: (s: string) => `${esc("43")}${esc("30")} ${s} ${reset}`,
};

export const LOGO =
  "\n" +
  c.dim("                         ,-.        _.---._") + "\n" +
  c.dim("                        |  ") + c.yellow("`\\.__.-''") + c.dim("       `.") + "\n" +
  c.dim("                         \\  ") + c.yellow("_        _  ,.") + c.dim("   \\") + "\n" +
  c.yellow("   ,+++=._________________)_||______|_|_||") + c.dim("    |") + "\n" +
  c.yellow("   (_.ooo.===================||======|=|=||") + c.dim("    |") + "\n" +
  c.dim("      ~~'                 |  ~'      ~'  ") + c.yellow("o o") + c.dim("  /") + "\n" +
  c.dim("                          \\   /~`\\     ") + c.yellow("o o") + c.dim("  /") + "\n" +
  c.dim("                           ~'    `-.____.-'") + "\n" +
  "\n" +
  c.bold(c.yellow("   F R E T")) + " " + c.dim("v0.1.0") + "\n" +
  c.dim("   Convention linter for AI agents") + "\n";

export const LOGO_MINI = `${c.yellow("♪")} ${c.bold("fret")}`;

export function step(n: number, total: number, msg: string) {
  console.log(`\n  ${c.cyan(`[${n}/${total}]`)} ${msg}`);
}

export function done(msg: string) {
  console.log(`       ${c.green("✓")} ${msg}`);
}

export function warn(msg: string) {
  console.log(`       ${c.yellow("!")} ${msg}`);
}

export function fail(msg: string) {
  console.log(`       ${c.red("✗")} ${msg}`);
}

export function info(msg: string) {
  console.log(`       ${c.dim(msg)}`);
}

export function item(msg: string) {
  console.log(`         ${c.dim("→")} ${msg}`);
}

export function header(msg: string) {
  console.log(`\n  ${c.bold(msg)}`);
}

export function nl() {
  console.log("");
}

export function box(lines: string[]) {
  const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length));
  const pad = (s: string) =>
    s + " ".repeat(Math.max(0, maxLen - stripAnsi(s).length));
  console.log(`  ${c.dim("┌─" + "─".repeat(maxLen) + "─┐")}`);
  for (const line of lines) {
    console.log(`  ${c.dim("│")} ${pad(line)} ${c.dim("│")}`);
  }
  console.log(`  ${c.dim("└─" + "─".repeat(maxLen) + "─┘")}`);
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export function divider() {
  console.log(c.dim("  " + "─".repeat(41)));
}

/** 프로그레스 바 with animated dots */
export function startProgress(_label: string): {
  update: (pct: number, label?: string) => void;
  finish: (msg: string) => void;
} {
  const width = 25;
  let lastRendered = -1;
  let dotFrame = 0;
  const dots = ["   ", ".  ", ".. ", "...", " ..", "  .", "   ", ".  ", ".. ", "..."];

  const render = (pct: number, label?: string) => {
    if (pct === lastRendered && !label) return;
    lastRendered = pct;
    dotFrame = (dotFrame + 1) % dots.length;
    const filled = Math.round((pct / 100) * width);
    const empty = width - filled;
    const bar = c.yellow("█".repeat(filled)) + c.dim("░".repeat(empty));
    const displayLabel = label || _label;
    const animDots = pct < 100 ? c.yellow(dots[dotFrame]) : "";
    process.stdout.write(
      `\r       ${bar} ${c.bold(String(pct).padStart(3) + "%")} ${c.dim(displayLabel)}${animDots}   `
    );
  };

  return {
    update: render,
    finish: (msg: string) => {
      process.stdout.write(
        `\r       ${c.yellow("█".repeat(width))} ${c.bold("100%")} ${c.dim("Done")}   \n`
      );
      console.log(`       ${c.green("✓")} ${msg}`);
    },
  };
}

/** Enter를 기다리는 인터랙티브 프롬프트 */
export function waitForEnter(
  msg = "Press Enter to continue..."
): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(`\n  ${c.dim(msg)} `);
    if (!process.stdin.isTTY) {
      resolve();
      return;
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      console.log("");
      resolve();
    });
  });
}

/** 선택지를 보여주고 번호로 선택 */
export function selectOption(options: { key: string; label: string; desc: string }[]): Promise<string> {
  return new Promise((resolve) => {
    nl();
    for (const opt of options) {
      console.log(`    ${c.bold(c.yellow(opt.key))}  ${c.bold(opt.label)}`);
      console.log(`       ${c.dim(opt.desc)}`);
    }
    nl();
    process.stdout.write(`  ${c.dim("Select (")}${options.map(o => o.key).join("/")}${c.dim("):")} `);

    if (!process.stdin.isTTY) {
      resolve(options[0].key);
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();

    const handler = (data: Buffer) => {
      const key = data.toString().trim();
      const match = options.find((o) => o.key === key);
      if (match) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", handler);
        console.log(c.bold(match.label));
        nl();
        resolve(match.key);
      }
    };

    process.stdin.on("data", handler);
  });
}
