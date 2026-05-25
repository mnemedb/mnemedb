/**
 * One-shot demo bootstrap for the launch-day video.
 *
 *   bun scripts/demo-bootstrap.ts                 → handle = "agentdemo"
 *   HANDLE=foo bun scripts/demo-bootstrap.ts      → custom handle
 *
 * Generates a fresh EOA, signs CreateProject against the production gateway,
 * then prints the agent's private key + a ready-to-paste Cursor `mcp.json`
 * block + the dashboard URL so we can pin the same wallet to MetaMask for
 * the dashboard half of the screen recording.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const GATEWAY = process.env.MNEME_GATEWAY ?? "https://gateway.mnemedb.dev";
const HANDLE  = process.env.HANDLE ?? "agentdemo";

const pk      = generatePrivateKey();
const account = privateKeyToAccount(pk);

console.log("─ demo bootstrap ─────────────────────");
console.log("gateway:", GATEWAY);
console.log("handle :", HANDLE);
console.log("wallet :", account.address);
console.log("");

const ts = Math.floor(Date.now() / 1000);
const signature = await account.signTypedData({
  domain: { name: "Mneme", version: "1", chainId: 8453 },
  types: {
    CreateProject: [
      { name: "handle",    type: "string"  },
      { name: "timestamp", type: "uint256" },
    ],
  },
  primaryType: "CreateProject",
  message: { handle: HANDLE, timestamp: BigInt(ts) },
});

const res = await fetch(`${GATEWAY}/projects`, {
  method:  "POST",
  headers: { "content-type": "application/json" },
  body:    JSON.stringify({ handle: HANDLE, timestamp: ts, wallet: account.address, signature }),
});
if (!res.ok) {
  console.error("create project failed:", res.status, await res.text());
  process.exit(1);
}
const project = await res.json();
console.log("✓ project created:", project);
console.log("");

console.log("═══ COPY-PASTE FOR DEMO ══════════════════════════════════════════");
console.log("");
console.log("  Private key (also for MetaMask import):");
console.log("    " + pk);
console.log("");
console.log("  Cursor mcp.json   (path: %USERPROFILE%\\.cursor\\mcp.json)");
console.log("  ─────────────────────────────────────────────────────────────");
console.log(JSON.stringify({
  mcpServers: {
    mneme: {
      command: "bunx",
      args:    ["-y", "mneme-mcp"],
      env: {
        MNEME_AGENT_PRIVATE_KEY: pk,
        MNEME_GATEWAY_URL:       GATEWAY,
      },
    },
  },
}, null, 2));
console.log("");
console.log("  Dashboard URL (connect with MetaMask after importing key above):");
console.log("    https://mnemedb.dev");
console.log("");
console.log("══════════════════════════════════════════════════════════════════");
