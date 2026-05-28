import { goldGradient, gold, goldSoft, ink, inkDim, dim } from "./theme";

/**
 * Hand-laid block ASCII for "MNEME" — distinct silhouette, not figlet
 * default. Gold gradient applied at render time.
 */
const MNEME_ASCII = `
 ███╗   ███╗ ███╗   ██╗ ███████╗ ███╗   ███╗ ███████╗
 ████╗ ████║ ████╗  ██║ ██╔════╝ ████╗ ████║ ██╔════╝
 ██╔████╔██║ ██╔██╗ ██║ █████╗   ██╔████╔██║ █████╗
 ██║╚██╔╝██║ ██║╚██╗██║ ██╔══╝   ██║╚██╔╝██║ ██╔══╝
 ██║ ╚═╝ ██║ ██║ ╚████║ ███████╗ ██║ ╚═╝ ██║ ███████╗
 ╚═╝     ╚═╝ ╚═╝  ╚═══╝ ╚══════╝ ╚═╝     ╚═╝ ╚══════╝
`;

const TEMPLE = `
        ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
       ▐                 ▌
   ▐██▌▐██▌▐██▌▐██▌▐██▌▐██▌
   ▐██▌▐██▌▐██▌▐██▌▐██▌▐██▌
   ▀██▀▀██▀▀██▀▀██▀▀██▀▀██▀
   ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
`;

export function renderBanner(handle?: string): string {
  const w = 60;
  const sep = ink("─".repeat(w));

  const ascii = goldGradient(MNEME_ASCII);
  const tag   = goldSoft("  memory you can hold in your terminal");
  const sub   = inkDim ("  agent-native database on Base · mnemedb.dev");

  const status = handle
    ? `  ${ink("session ·")} ${gold(handle)}${ink(".mneme")}`
    : `  ${ink("session ·")} ${dim("not logged in")}`;

  return `
${ascii}
${tag}
${sub}

${sep}
${status}
${sep}
`;
}

/** Slim header redrawn on every prompt — keeps context visible. */
export function renderMiniHeader(handle: string, lastMs?: number): string {
  const left  = `${gold("✦ mneme")} ${ink("·")} ${goldSoft(handle)}${ink(".mneme")}`;
  const right = lastMs !== undefined ? inkDim(`(${lastMs}ms)`) : "";
  return `${left} ${right}`;
}

export function renderTemple(): string {
  return goldGradient(TEMPLE);
}
