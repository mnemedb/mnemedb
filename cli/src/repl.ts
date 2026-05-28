import { createInterface } from "node:readline/promises";
import { Mneme, MnemeError } from "mneme-sdk";
import type { MnemeConfig } from "./config";
import { renderTable, renderSql, renderHelp } from "./render";
import { renderMiniHeader } from "./banner";
import { gold, goldSoft, ink, inkDim, ok, err, dim, marble } from "./theme";

export async function runRepl(cfg: MnemeConfig): Promise<void> {
  const m = new Mneme({ apiKey: cfg.api_key, gatewayUrl: cfg.gateway_url });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt(`  ${gold("›")} `);

  let lastMs: number | undefined;

  const printHeader = () => {
    console.log("");
    console.log(renderMiniHeader(cfg.handle!, lastMs));
  };

  printHeader();
  console.log(`  ${inkDim("type")} ${dim("/help")} ${inkDim("for commands, or ask anything in plain english")}`);
  rl.prompt();

  rl.on("line", async (raw) => {
    const input = raw.trim();
    if (!input) { rl.prompt(); return; }

    // Slash commands
    if (input.startsWith("/")) {
      const handled = await handleSlash(m, cfg, input);
      if (handled === "exit") { rl.close(); return; }
      printHeader();
      rl.prompt();
      return;
    }

    // Natural language → SQL → execute
    const t0 = Date.now();
    try {
      process.stdout.write(`  ${dim("thinking…")}`);
      const llm = await m.llm.sql({ prompt: input });
      process.stdout.write("\r" + " ".repeat(20) + "\r");   // clear "thinking…"

      console.log(`  ${ink("─".repeat(60))}`);
      console.log(`  ${renderSql(llm.sql)}`);
      console.log(`  ${ink("─".repeat(60))}`);

      const result = await m.sql(llm.sql);
      lastMs = Date.now() - t0;

      if (result.row_count === 0) {
        console.log(`  ${ok("✓")} ${inkDim(`OK · no rows · ${result.elapsed_ms}ms query`)}`);
      } else {
        console.log(renderTable(result.rows as Record<string, unknown>[], result.columns));
        console.log(`  ${ok("✓")} ${inkDim(`${result.row_count} rows · ${result.elapsed_ms}ms query · ${llm.elapsed_ms}ms llm`)}`);
        if (result.truncated) {
          console.log(`  ${inkDim("(server-side truncated at 1000 rows)")}`);
        }
      }
    } catch (e) {
      process.stdout.write("\r" + " ".repeat(20) + "\r");
      const msg = e instanceof MnemeError ? `[${e.status}] ${e.message}` : (e as Error).message;
      console.log(`  ${err("✗")} ${msg}`);
    }

    printHeader();
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("");
    console.log(`  ${goldSoft("Mneme remembers.")} ${ink("→ Hayırlı kalın.")}`);
    process.exit(0);
  });
}

async function handleSlash(m: Mneme, cfg: MnemeConfig, input: string): Promise<"exit" | "ok"> {
  const [cmd, ...rest] = input.slice(1).split(" ");
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "help": {
      console.log(renderHelp());
      return "ok";
    }
    case "exit":
    case "quit":
      return "exit";

    case "clear":
      process.stdout.write("\x1Bc");
      return "ok";

    case "whoami": {
      console.log("");
      console.log(`  ${ink("handle")}   ${gold(cfg.handle ?? "—")}`);
      console.log(`  ${ink("wallet")}   ${marble(cfg.wallet ?? "—")}`);
      console.log(`  ${ink("gateway")}  ${marble(cfg.gateway_url)}`);
      console.log("");
      return "ok";
    }

    case "tables": {
      try {
        const r = await m.listTables();
        console.log("");
        console.log(renderTable(
          r.tables.map((t) => ({
            name:      t.name,
            kind:      t.isDefault ? "default" : "custom",
            rows:      t.rowCount,
            columns:   t.columns.length,
          })),
          ["name", "kind", "rows", "columns"],
        ));
      } catch (e) {
        console.log(`  ${err("✗")} ${(e as Error).message}`);
      }
      return "ok";
    }

    case "schema": {
      if (!arg) {
        console.log(`  ${err("✗")} usage: /schema <table_name>`);
        return "ok";
      }
      try {
        const r = await m.sql(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = '${arg.replace(/'/g, "''")}'
          ORDER BY ordinal_position
        `);
        console.log("");
        console.log(renderTable(r.rows as Record<string, unknown>[], r.columns));
      } catch (e) {
        console.log(`  ${err("✗")} ${(e as Error).message}`);
      }
      return "ok";
    }

    case "sql": {
      if (!arg) {
        console.log(`  ${err("✗")} usage: /sql <raw query>`);
        return "ok";
      }
      try {
        const r = await m.sql(arg);
        console.log("");
        if (r.row_count === 0) {
          console.log(`  ${ok("✓")} ${inkDim("OK · no rows · " + r.elapsed_ms + "ms")}`);
        } else {
          console.log(renderTable(r.rows as Record<string, unknown>[], r.columns));
          console.log(`  ${ok("✓")} ${inkDim(`${r.row_count} rows · ${r.elapsed_ms}ms`)}`);
        }
      } catch (e) {
        console.log(`  ${err("✗")} ${(e as Error).message}`);
      }
      return "ok";
    }

    case "quota": {
      try {
        const q = await m.storage.quota();
        console.log("");
        console.log(`  ${ink("used")}        ${marble(fmtBytes(q.bytes_used))} ${ink("/")} ${gold(fmtBytes(q.bytes_limit))}`);
        console.log(`  ${ink("available")}   ${marble(fmtBytes(q.bytes_available))}`);
        console.log(`  ${ink("free tier")}   ${marble(fmtBytes(q.free_tier_bytes))}`);
        if (q.bonus_expires_at) {
          console.log(`  ${ink("bonus until")} ${goldSoft(new Date(q.bonus_expires_at).toLocaleString())}`);
        }
        console.log("");
      } catch (e) {
        console.log(`  ${err("✗")} ${(e as Error).message}`);
      }
      return "ok";
    }

    default:
      console.log(`  ${err("✗")} unknown command: /${cmd}`);
      console.log(`     ${inkDim("type /help to see all commands")}`);
      return "ok";
  }
}

function fmtBytes(b: number): string {
  if (b < 1024)              return `${b} B`;
  if (b < 1024 * 1024)       return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
