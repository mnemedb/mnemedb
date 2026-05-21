import { useState } from "react";
import { useExportWallet, usePrivy } from "@privy-io/react-auth";

const GATEWAY =
  import.meta.env.VITE_MNEME_GATEWAY_URL ?? "https://gateway.mnemedb.dev";

const PUBLISHED_CONFIG = JSON.stringify(
  {
    mcpServers: {
      mneme: {
        command: "mneme-mcp",
        env: {
          MNEME_AGENT_PRIVATE_KEY: "0x<paste-from-export-wallet>",
          MNEME_GATEWAY_URL:        GATEWAY,
        },
      },
    },
  },
  null,
  2,
);

const LOCAL_DEV_CONFIG = JSON.stringify(
  {
    mcpServers: {
      mneme: {
        command: "node",
        args:    ["<path-to-mneme>/mcp/dist/index.js"],
        env: {
          MNEME_AGENT_PRIVATE_KEY: "0x<paste-from-export-wallet>",
          MNEME_GATEWAY_URL:        GATEWAY,
        },
      },
    },
  },
  null,
  2,
);

export function McpSetupCard() {
  const { user } = usePrivy();
  const { exportWallet } = useExportWallet();
  const [tab, setTab] = useState<"published" | "local">("published");
  const [copied, setCopied] = useState(false);

  const config = tab === "published" ? PUBLISHED_CONFIG : LOCAL_DEV_CONFIG;
  const isEmbedded = user?.wallet?.walletClientType === "privy";

  const copy = () => {
    navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-ink-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">
              Connect from Claude / Cursor / Cline
            </div>
            <div className="text-xs text-ink-500 mt-0.5">
              Install once with{" "}
              <code className="font-mono text-gold-300/80">npm i -g mneme-mcp</code>,
              then paste the config below into your MCP client.
            </div>
          </div>
          <button
            onClick={copy}
            className="shrink-0 px-3 py-1.5 text-xs bg-white text-black rounded-lg font-medium hover:bg-marble-100 transition"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          <Tab active={tab === "published"} onClick={() => setTab("published")} label="npm (recommended)" />
          <Tab active={tab === "local"}     onClick={() => setTab("local")}     label="Local dev" />
        </div>
      </div>

      <pre className="px-5 py-4 text-xs font-mono text-ink-200 overflow-x-auto leading-relaxed">
        {config}
      </pre>

      <div className="px-5 py-4 border-t border-ink-800 bg-ink-950/40 space-y-3">
        <div className="text-xs text-ink-300 leading-relaxed">
          <span className="text-gold-300 font-medium">Step 1.</span>{" "}
          Get the private key for <code className="font-mono text-gold-300/80">MNEME_AGENT_PRIVATE_KEY</code>{" "}
          {isEmbedded ? (
            <>by exporting your embedded wallet — Privy opens a secure modal
            with a "Reveal private key" button. The exported key is for the
            <em> same </em> wallet that owns this project, so the MCP server
            writes to <em>your</em> tables.</>
          ) : (
            <>by using your existing external wallet's private key (MetaMask:
            account menu → Account details → Show private key). Since this is
            your own wallet, MCP writes to your project.</>
          )}
        </div>

        {isEmbedded && (
          <button
            onClick={() => exportWallet()}
            className="px-4 py-2 rounded-lg bg-gold-400/15 hover:bg-gold-400/25 border border-gold-400/30 text-gold-300 text-xs font-medium transition"
          >
            Export wallet for MCP →
          </button>
        )}

        <div className="text-xs text-ink-400 leading-relaxed pt-1">
          <span className="text-gold-300 font-medium">Step 2.</span>{" "}
          Paste the config into your MCP client (Claude Desktop:{" "}
          <code className="font-mono text-gold-300/80">~/Library/Application Support/Claude/claude_desktop_config.json</code>{" "}
          on mac, <code className="font-mono text-gold-300/80">%APPDATA%/Claude/claude_desktop_config.json</code>{" "}
          on Windows). Replace the private-key placeholder, then restart Claude.
        </div>

        <div className="text-xs text-ink-400 leading-relaxed">
          <span className="text-gold-300 font-medium">Step 3.</span>{" "}
          Verify: ask Claude{" "}
          <em>"use the mneme MCP to list my tables"</em> — you should see all four
          default tables plus any custom ones. Then ask{" "}
          <em>"create a table called 'tasks' with text + jsonb columns"</em> and
          refresh this dashboard's Tables view to see it appear.
        </div>

        <div className="text-xs text-ink-500 leading-relaxed pt-2 border-t border-ink-800/60">
          <span className="text-ink-400 font-medium">Phase 2:</span>{" "}
          link multiple agent wallets to one project — your humans-owned wallet
          stays in the dashboard, agent wallets get scoped write access without
          exporting anything.
        </div>
      </div>
    </div>
  );
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-lg font-medium transition ${
        active
          ? "bg-ink-800 text-white border border-ink-700"
          : "bg-transparent text-ink-500 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
