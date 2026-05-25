/**
 * $MNEME launch — Clawncher direct deploy (no API key, no $CLAWNCH).
 *
 *   bun add @clawnch/clawncher-sdk
 *   $env:LAUNCH_KEY = "0x<launch-wallet-key>"
 *   bun run scripts/clawnch-deploy.ts
 *
 * Dry-run prints params + ETH balance. To actually launch, uncomment the
 * deploy() block at the bottom and re-run. Token is live + tradeable the
 * instant deploy() returns — no undo.
 */
// ClawnchDeployer (free direct path) — we patched the installed SDK's index.js
// to re-export it (upstream only exposes the verified ApiDeployer).
import { ClawnchDeployer } from "@clawnch/clawncher-sdk";
import { createPublicClient, createWalletClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const LAUNCH_KEY = process.env.LAUNCH_KEY as `0x${string}` | undefined;
if (!LAUNCH_KEY) { console.error("LAUNCH_KEY env required"); process.exit(1); }

const EXPECTED_WALLET = "0x537EA37F84132756B9795AA712cf55DA3b1F7780";

const account      = privateKeyToAccount(LAUNCH_KEY);
const wallet       = createWalletClient ({ account, chain: base, transport: http() });
const publicClient = createPublicClient ({           chain: base, transport: http() });

console.log("launch wallet:", account.address);

if (account.address.toLowerCase() !== EXPECTED_WALLET.toLowerCase()) {
  console.error(`❌ WRONG WALLET — expected ${EXPECTED_WALLET}, got ${account.address}`);
  console.error("   refusing to deploy. set LAUNCH_KEY to the private key of the expected wallet.");
  process.exit(1);
}
console.log("✓ wallet matches expected launch wallet");

const PARAMS = {
  name:       "Mneme",
  symbol:     "MNEME",
  tokenAdmin: account.address,
  image:      "https://mnemedb.dev/mnemelogo.png",
  metadata: {
    description: "The agent-native database platform on Base. Wallet-auth, runtime DDL, pgvector built-in.",
    website:     "https://mnemedb.dev",
    github:      "https://github.com/mnemedb/mnemedb",
  },
  rewards: {
    // Note: bps in recipients[] must sum to 10000 (= 100% of the 80% LP fee
    // share that goes to non-protocol recipients; the other 20% always goes
    // to Clanker protocol). So bps:10000 = launch wallet receives the full
    // 80% recipient share.
    recipients: [
      {
        recipient:     account.address,
        admin:         account.address,
        bps:           10000,
        feePreference: "Paired" as const,
      },
    ],
  },
};

console.log("\nparams:");
console.log(JSON.stringify(PARAMS, null, 2));

const balance = await publicClient.getBalance({ address: account.address });
console.log("\nETH on Base:", formatEther(balance), "ETH");
if (balance < 5_000_000_000_000_000n) {
  console.warn("⚠ wallet has < 0.005 ETH — deploy will likely fail on gas");
}

console.log("\n──────────────────────────────────────────");
console.log("LIVE DEPLOY — this is irreversible.");
console.log("──────────────────────────────────────────");

const deployer = new ClawnchDeployer({ wallet, publicClient, network: "mainnet" });

console.log("\nDEPLOYING…");
const result = await deployer.deploy(PARAMS);

if (result.error) {
  console.error("\n❌ deploy failed:", result.error.message);
  process.exit(1);
}

console.log("\ntxHash:", result.txHash);
console.log("waiting for tx to land + indexing token address…");
const { address } = await result.waitForTransaction();

if (!address) {
  console.error("❌ tx landed but no token address returned");
  process.exit(1);
}

console.log("\n🏛️  $MNEME deployed");
console.log("  tokenAddress :", address);
console.log("  basescan     : https://basescan.org/token/" + address);
console.log("  dexscreener  : https://dexscreener.com/base/" + address);
