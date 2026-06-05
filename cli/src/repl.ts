import { createInterface } from "node:readline/promises";
import { Mneme, MnemeError } from "mneme-sdk";
import type { MnemeConfig } from "./config";
import { renderTable, renderSql, renderHelp } from "./render";
import { renderMiniHeader } from "./banner";
import { gold, goldSoft, ink, inkDim, ok, err, dim, marble } from "./theme";
import { cmdPrice, cmdGas, cmdTrending, cmdNew, cmdTvl, cmdWallet, cmdScan } from "./base";

type ChatTurn = { role: "user" | "assistant"; content: string };

export async function runRepl(cfg: MnemeConfig): Promise<void> {
  const m = new Mneme({ apiKey: cfg.api_key, gatewayUrl: cfg.gateway_url });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt(`  ${gold("›")} `);

  let lastMs: number | undefined;
  const chatHistory: ChatTurn[] = [];

  const printHeader = () => {
    console.log("");
    console.log(renderMiniHeader(cfg.handle!, lastMs));
  };

  printHeader();
  console.log(`  ${inkDim("type")} ${dim("/help")} ${inkDim("for commands, or ask in plain english — try")} ${dim("/chat")} ${inkDim("or")} ${dim("/price degen")}`);
  rl.prompt();

  rl.on("line", async (raw) => {
    const input = raw.trim();
    if (!input) { rl.prompt(); return; }

    // Slash commands
    if (input.startsWith("/")) {
      const handled = await handleSlash(m, cfg, input, chatHistory);
      if (handled === "exit") { rl.close(); return; }
      printHeader();
      rl.prompt();
      return;
    }

    // Natural language → SQL → execute (default behavior)
    const t0 = Date.now();
    try {
      process.stdout.write(`  ${dim("thinking…")}`);
      const llm = await m.llm.sql({ prompt: input });
      process.stdout.write("\r" + " ".repeat(20) + "\r");

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
      console.log(`  ${inkDim("hint: not a SQL question? try")} ${dim("/chat " + input.slice(0, 40))}${inkDim(input.length > 40 ? "…" : "")}`);
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

async function handleSlash(
  m: Mneme,
  cfg: MnemeConfig,
  input: string,
  chatHistory: ChatTurn[],
): Promise<"exit" | "ok"> {
  const [cmd, ...rest] = input.slice(1).split(" ");
  const arg = rest.join(" ").trim();

  try {
    switch (cmd) {
      case "help":
        console.log(renderHelp());
        return "ok";

      case "exit":
      case "quit":
        return "exit";

      case "clear":
        process.stdout.write("\x1Bc");
        return "ok";

      case "whoami":
        console.log("");
        console.log(`  ${ink("handle")}   ${gold(cfg.handle ?? "—")}`);
        console.log(`  ${ink("wallet")}   ${marble(cfg.wallet ?? "—")}`);
        console.log(`  ${ink("gateway")}  ${marble(cfg.gateway_url)}`);
        console.log("");
        return "ok";

      case "tables": {
        const r = await m.listTables();
        console.log("");
        console.log(renderTable(
          r.tables.map((t) => ({
            name:    t.name,
            kind:    t.isDefault ? "default" : "custom",
            rows:    t.rowCount,
            columns: t.columns.length,
          })),
          ["name", "kind", "rows", "columns"],
        ));
        return "ok";
      }

      case "schema": {
        if (!arg) { console.log(`  ${err("✗")} usage: /schema <table_name>`); return "ok"; }
        const r = await m.sql(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = '${arg.replace(/'/g, "''")}'
          ORDER BY ordinal_position
        `);
        console.log("");
        console.log(renderTable(r.rows as Record<string, unknown>[], r.columns));
        return "ok";
      }

      case "sql": {
        if (!arg) { console.log(`  ${err("✗")} usage: /sql <raw query>`); return "ok"; }
        const r = await m.sql(arg);
        console.log("");
        if (r.row_count === 0) {
          console.log(`  ${ok("✓")} ${inkDim("OK · no rows · " + r.elapsed_ms + "ms")}`);
        } else {
          console.log(renderTable(r.rows as Record<string, unknown>[], r.columns));
          console.log(`  ${ok("✓")} ${inkDim(`${r.row_count} rows · ${r.elapsed_ms}ms`)}`);
        }
        return "ok";
      }

      case "quota": {
        const q = await m.storage.quota();
        console.log("");
        console.log(`  ${ink("used")}        ${marble(fmtBytes(q.bytes_used))} ${ink("/")} ${gold(fmtBytes(q.bytes_limit))}`);
        console.log(`  ${ink("available")}   ${marble(fmtBytes(q.bytes_available))}`);
        console.log(`  ${ink("free tier")}   ${marble(fmtBytes(q.free_tier_bytes))}`);
        if (q.bonus_expires_at) {
          console.log(`  ${ink("bonus until")} ${goldSoft(new Date(q.bonus_expires_at).toLocaleString())}`);
        }
        console.log("");
        return "ok";
      }

      // ─── New: /chat ────────────────────────────────────────────────
      case "chat":
      case "ask":
      case "ai": {
        if (!arg) { console.log(`  ${err("✗")} usage: /chat <message>`); return "ok"; }
        const t0 = Date.now();
        process.stdout.write(`  ${dim("thinking…")}`);
        const r = await m.llm.chat({ prompt: arg, history: chatHistory });
        process.stdout.write("\r" + " ".repeat(20) + "\r");
        console.log("");
        console.log(`  ${gold("◆")} ${marble(r.reply.split("\n").join("\n    "))}`);
        console.log("");
        console.log(`  ${inkDim(`${r.model.split("/").pop()} · ${Date.now() - t0}ms`)}`);
        chatHistory.push({ role: "user", content: arg });
        chatHistory.push({ role: "assistant", content: r.reply });
        if (chatHistory.length > 12) chatHistory.splice(0, chatHistory.length - 12);
        return "ok";
      }

      case "reset":
        chatHistory.length = 0;
        console.log(`  ${ok("✓")} ${inkDim("chat history cleared")}`);
        return "ok";

      // ─── New: Base ecosystem ────────────────────────────────────────
      case "price":   console.log(await cmdPrice(arg));    return "ok";
      case "gas":     console.log(await cmdGas());          return "ok";
      case "trending":console.log(await cmdTrending());     return "ok";
      case "new":     console.log(await cmdNew());          return "ok";
      case "tvl":     console.log(await cmdTvl());          return "ok";
      case "wallet":  console.log(await cmdWallet(arg));    return "ok";
      case "scan":    console.log(await cmdScan(arg));      return "ok";

      // ─── Mneme Live · chain streams ─────────────────────────────────
      case "watch": {
        // /watch <event> on <contract> into <table>
        // /watch "Transfer(address,address,uint256)" on 0x... into transfers
        const quoted = arg.match(/^"([^"]+)"\s+on\s+(0x[0-9a-fA-F]{40})\s+into\s+([a-z_][a-z0-9_]*)$/i);
        const bare   = arg.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+on\s+(0x[0-9a-fA-F]{40})\s+into\s+([a-z_][a-z0-9_]*)$/);
        const match  = quoted || bare;
        if (!match) {
          console.log(`  ${err("✗")} usage: /watch <event> on <0xcontract> into <table>`);
          console.log(`     ${inkDim('examples: /watch transfer on 0x3FcD…7b07 into mneme_transfers')}`);
          console.log(`     ${inkDim('          /watch "Transfer(address,address,uint256)" on 0x... into transfers')}`);
          return "ok";
        }
        const [, evt, contract, table] = match;
        const r = await m.streams.watch({ contract: contract!, event: evt!, target_table: table! });
        console.log("");
        console.log(`  ${ok("✓")} ${marble(`stream #${r.id} active`)}`);
        console.log(`  ${ink("event   ")} ${gold(r.event_name)} ${inkDim("·")} ${dim(r.event_signature)}`);
        console.log(`  ${ink("contract")} ${marble(r.contract)}`);
        console.log(`  ${ink("table   ")} ${goldSoft(r.target_table)} ${inkDim("(in your schema)")}`);
        console.log(`  ${inkDim(r.note)}`);
        return "ok";
      }

      case "streams": {
        const r = await m.streams.list();
        console.log("");
        if (r.streams.length === 0) {
          console.log(`  ${inkDim("no streams yet — try /watch transfer on <0x...> into <table>")}`);
          return "ok";
        }
        console.log(renderTable(
          r.streams.map((s) => ({
            id:       s.id,
            event:    s.event_name,
            contract: s.contract.slice(0, 8) + "…" + s.contract.slice(-4),
            table:    s.target_table,
            active:   s.active ? "✓" : "—",
            last_blk: s.last_block || "—",
          })),
          ["id", "event", "contract", "table", "active", "last_blk"],
        ));
        return "ok";
      }

      case "unwatch": {
        const id = Number(arg);
        if (!Number.isInteger(id) || id <= 0) {
          console.log(`  ${err("✗")} usage: /unwatch <stream_id>   (run /streams to find the id)`);
          return "ok";
        }
        const r = await m.streams.unwatch(id);
        console.log(`  ${ok("✓")} ${inkDim(`stream #${r.id} paused — ${r.note}`)}`);
        return "ok";
      }

      // ─── Mneme Graph · entities + relations ─────────────────────────
      case "entity": {
        // /entity add <kind> <name> [json-props]
        // /entity list [kind] [name_like]
        const [sub, ...rest2] = arg.split(/\s+/);
        const tail = rest2.join(" ");
        if (sub === "add") {
          const m1 = tail.match(/^(\S+)\s+("(?:[^"]+)"|\S+)(?:\s+(\{.*\}))?$/);
          if (!m1) {
            console.log(`  ${err("✗")} usage: /entity add <kind> "<name>" [{json props}]`);
            return "ok";
          }
          const [, kind, nameRaw, propsStr] = m1;
          const name  = nameRaw!.replace(/^"|"$/g, "");
          const props = propsStr ? JSON.parse(propsStr) : undefined;
          const r = await m.graph.addEntity({ kind: kind!, name, properties: props });
          console.log(`  ${ok("✓")} ${inkDim("entity")} ${gold("#" + r.id)} ${goldSoft(r.kind + ":" + r.name)}`);
          return "ok";
        }
        if (sub === "list" || sub === undefined || sub === "") {
          const [kindArg, ...nameToks] = rest2;
          const r = await m.graph.listEntities({
            kind:      kindArg,
            name_like: nameToks.join(" ") || undefined,
            limit:     50,
          });
          console.log("");
          if (r.count === 0) {
            console.log(`  ${inkDim("(no entities yet — try /entity add person vitalik)")}`);
            return "ok";
          }
          console.log(renderTable(
            r.entities.map((e) => ({ id: e.id, kind: e.kind, name: e.name })),
            ["id", "kind", "name"],
          ));
          return "ok";
        }
        if (sub === "rm" || sub === "delete") {
          const id = Number(rest2[0]);
          if (!id) { console.log(`  ${err("✗")} usage: /entity rm <id>`); return "ok"; }
          await m.graph.deleteEntity(id);
          console.log(`  ${ok("✓")} ${inkDim(`entity #${id} deleted (cascaded relations gone)`)}`);
          return "ok";
        }
        console.log(`  ${err("✗")} usage: /entity {add|list|rm}`);
        return "ok";
      }

      case "relate": {
        // /relate <src_ref> <kind> <dst_ref> [{json props}]
        // refs are either numeric ids or "kind:name"
        const m1 = arg.match(/^(\S+)\s+(\S+)\s+(\S+)(?:\s+(\{.*\}))?$/);
        if (!m1) {
          console.log(`  ${err("✗")} usage: /relate <src> <kind> <dst> [{json props}]`);
          console.log(`     ${inkDim('refs: numeric id (3) or "kind:name" ("person:vitalik")')}`);
          return "ok";
        }
        const [, src, kind, dst, propsStr] = m1;
        const props = propsStr ? JSON.parse(propsStr) : undefined;
        const srcRef = /^\d+$/.test(src!) ? Number(src) : src!;
        const dstRef = /^\d+$/.test(dst!) ? Number(dst) : dst!;
        const r = await m.graph.addRelation({ src: srcRef, dst: dstRef, kind: kind!, properties: props });
        console.log(`  ${ok("✓")} ${inkDim("edge")} ${gold("#" + r.id)} ${marble(`${src} ─[${kind}]→ ${dst}`)}`);
        return "ok";
      }

      case "neighbors": {
        // /neighbors <id> [hops=N]
        const m1 = arg.match(/^(\d+)(?:\s+hops=(\d+))?(?:\s+kinds=(\S+))?$/);
        if (!m1) {
          console.log(`  ${err("✗")} usage: /neighbors <id> [hops=N] [kinds=k1,k2]`);
          return "ok";
        }
        const id    = Number(m1[1]);
        const hops  = m1[2] ? Number(m1[2]) : 1;
        const kinds = m1[3] ? m1[3].split(",") : undefined;
        const r = await m.graph.neighbors(id, { hops, edge_kinds: kinds });
        console.log("");
        if (r.count === 0) {
          console.log(`  ${inkDim(`no neighbors within ${hops} hop(s)`)}`);
          return "ok";
        }
        console.log(renderTable(
          r.neighbors.map((n) => ({ id: n.id, kind: n.kind, name: n.name, hops: n.hops })),
          ["id", "kind", "name", "hops"],
        ));
        return "ok";
      }

      case "path": {
        const m1 = arg.match(/^(\d+)\s+(\d+)(?:\s+max=(\d+))?$/);
        if (!m1) {
          console.log(`  ${err("✗")} usage: /path <src_id> <dst_id> [max=N]`);
          return "ok";
        }
        const src = Number(m1[1]);
        const dst = Number(m1[2]);
        const max = m1[3] ? Number(m1[3]) : 4;
        const r = await m.graph.path(src, dst, { max_hops: max });
        console.log("");
        if (!r.found) {
          console.log(`  ${inkDim(`no path ${src} → ${dst} within ${max} hops`)}`);
          return "ok";
        }
        console.log(`  ${ok("✓")} ${inkDim(`path found · ${r.hops} hop(s)`)}`);
        const chain = r.path.map((n) => `${goldSoft(n!.kind)}:${marble(n!.name)}`).join(`  ${ink("→")}  `);
        console.log(`  ${chain}`);
        return "ok";
      }

      default:
        console.log(`  ${err("✗")} unknown command: /${cmd}`);
        console.log(`     ${inkDim("type /help to see all commands")}`);
        return "ok";
    }
  } catch (e) {
    const msg = e instanceof MnemeError ? `[${e.status}] ${e.message}` : (e as Error).message;
    console.log(`  ${err("✗")} ${msg}`);
    return "ok";
  }
}

function fmtBytes(b: number): string {
  if (b < 1024)              return `${b} B`;
  if (b < 1024 * 1024)       return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
