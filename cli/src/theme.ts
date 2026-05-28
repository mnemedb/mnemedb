import chalk from "chalk";

// True-color gold ramp — mirrors the brand palette (ink/marble/gold).
export const gold      = chalk.hex("#d4af37");
export const goldSoft  = chalk.hex("#e8c574");
export const goldFaint = chalk.hex("#f3e3a8");
export const goldDeep  = chalk.hex("#b8941e");
export const marble    = chalk.hex("#f8f4ec");
export const ink       = chalk.hex("#71717a");
export const inkDim    = chalk.hex("#52525b");
export const ok        = chalk.hex("#34d399");
export const err       = chalk.hex("#f87171");

/** Apply a top-to-bottom gold gradient to a multi-line block. */
export function goldGradient(text: string): string {
  const lines = text.split("\n");
  const shades = ["#fff5d4", "#f3e3a8", "#e8c574", "#d4af37", "#b8941e", "#9c7a18"];
  return lines
    .map((line, i) => chalk.hex(shades[Math.min(i, shades.length - 1)]!)(line))
    .join("\n");
}

export const dim = chalk.dim;
export const bold = chalk.bold;
