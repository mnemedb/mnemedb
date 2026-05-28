#!/usr/bin/env node
import { loadConfig } from "./config";
import { runLogin } from "./login";
import { runRepl } from "./repl";
import { renderBanner } from "./banner";

async function main() {
  const args = process.argv.slice(2);

  // Subcommands
  if (args[0] === "logout") {
    const { rm } = await import("fs/promises");
    const { configLocation } = await import("./config");
    try { await rm(configLocation()); console.log("logged out."); }
    catch { console.log("already logged out."); }
    return;
  }

  if (args[0] === "login") {
    const cfg = await runLogin();
    console.log(renderBanner(cfg.handle));
    await runRepl(cfg);
    return;
  }

  if (args[0] === "--version" || args[0] === "-v") {
    const pkg = await import("../package.json", { with: { type: "json" } });
    console.log((pkg.default as { version: string }).version);
    return;
  }

  if (args[0] === "--help" || args[0] === "-h") {
    console.log(`
  mneme — terminal client for the agent-native database on Base

  USAGE
    mneme              Start the REPL (login on first run)
    mneme login        Re-run the login flow
    mneme logout       Forget the saved API key
    mneme --version    Print version
    mneme --help       This help

  DOCS
    https://mnemedb.dev/docs
`);
    return;
  }

  // Default: load config (or trigger login) → REPL
  let cfg = await loadConfig();
  console.log(renderBanner(cfg?.handle));

  if (!cfg) {
    cfg = await runLogin();
  }

  await runRepl(cfg);
}

main().catch((e) => {
  console.error("\n  fatal:", (e as Error).message);
  process.exit(1);
});
