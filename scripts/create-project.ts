/**
 * One-off: create a Mneme project for a given private key + handle.
 * Not committed — local helper only.
 *
 *   $env:AGENT_KEY="0x..."; $env:HANDLE="shrine"; bun run scripts/create-project.ts
 */
import { privateKeyToAccount } from "viem/accounts";

const GATEWAY = process.env.MNEME_GATEWAY ?? "https://gateway.mnemedb.dev";
const RAW_KEY = process.env.AGENT_KEY;
const HANDLE  = process.env.HANDLE;

if (!RAW_KEY)   { console.error("AGENT_KEY env required"); process.exit(1); }
if (!HANDLE)    { console.error("HANDLE env required");    process.exit(1); }
if (!/^[a-z0-9_]{3,32}$/.test(HANDLE)) {
  console.error("HANDLE must be 3-32 chars, [a-z0-9_]"); process.exit(1);
}

const pk = (RAW_KEY.startsWith("0x") ? RAW_KEY : `0x${RAW_KEY}`) as `0x${string}`;
const account = privateKeyToAccount(pk);

console.log("gateway:", GATEWAY);
console.log("wallet :", account.address);
console.log("handle :", HANDLE);

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
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    wallet:    account.address,
    signature,
    handle:    HANDLE,
    timestamp: ts,
  }),
});
const json = await res.json();

if (res.ok) {
  console.log(`\n✓ created ${HANDLE}.mneme — schema: agent_${HANDLE}`);
  console.log(JSON.stringify(json, null, 2));
} else {
  console.error(`\n✗ ${res.status}:`, json);
  process.exit(1);
}
