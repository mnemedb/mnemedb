import { useState } from "react";

const GATEWAY =
  import.meta.env.VITE_MNEME_GATEWAY_URL ?? "https://gateway.mnemedb.dev";

// Honest local-dev snippet — the binary is the freshly-built file in this repo.
// Cross-platform: forward slashes work in Node even on Windows.
const LOCAL_DEV_CONFIG = JSON.stringify(
  {
    mcpServers: {
      mneme: {
        command: "node",
        args:    ["<path-to-mneme>/mcp/dist/index.js"],
        env: {
          MNEME_AGENT_PRIVATE_KEY: "0x<agent-eoa-private-key>",
          MNEME_GATEWAY_URL:        GATEWAY,
        },
      },
    },
  },
  null,
  2,
);

const PUBLISHED_CONFIG = JSON.stringify(
  {
    mcpServers: {
      mneme: {
        command: "mneme-mcp",
        env: {
          MNEME_AGENT_PRIVATE_KEY: "0x<agent-eoa-private-key>",
          MNEME_GATEWAY_URL:        GATEWAY,
        },
      },
    },
  },
  null,
  2,
);

export function McpSetupCard() {
  const [tab, setTab] = useState<"local" | "published">("local");
  const [copied, setCopied] = useState(false);

  const config = tab === "local" ? LOCAL_DEV_CONFIG : PUBLISHED_CONFIG;

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
              Paste into your MCP config. Replace placeholders.
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
          <Tab active={tab === "local"}     onClick={() => setTab("local")}     label="Local dev (works today)" />
          <Tab active={tab === "published"} onClick={() => setTab("published")} label="After npm publish" />
        </div>
      </div>

      <pre className="px-5 py-4 text-xs font-mono text-ink-200 overflow-x-auto leading-relaxed">
        {config}
      </pre>

      <div className="px-5 py-3 border-t border-ink-800 bg-ink-950/40 text-xs text-ink-400 space-y-2">
        <div>
          <span className="text-gold-300 font-medium">Heads up:</span>{" "}
          the agent's wallet must be a separate EOA (private key) — your
          Coinbase Smart Wallet doesn't expose one. The agent EOA also needs
          its own Mneme project (its own handle).
        </div>
        <div>
          <span className="text-ink-500">Coming Phase 2:</span>{" "}
          link agent keys to your project (one project, many agent wallets) +
          published <code className="font-mono">@mneme/mcp</code> on npm so the snippet shrinks.
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
