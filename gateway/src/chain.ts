import { createPublicClient, http, keccak256, toBytes } from "viem";
import { base } from "viem/chains";

const RPC_URL = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

/**
 * Public client used for:
 *   - signature verification (ERC-1271 / ERC-6492 smart wallets)
 *   - eth_getLogs polling by the Mneme Live chain-streams worker
 */
export const publicClient = createPublicClient({
  chain:     base,
  transport: http(RPC_URL),
});

// ─── Event signature helpers (used by /v1/streams + chain-streams worker) ──

/** Common ERC-20 / NFT event templates so users don't have to type ABIs. */
export const EVENT_TEMPLATES: Record<string, string> = {
  transfer: "Transfer(address,address,uint256)",
  approval: "Approval(address,address,uint256)",
  // NFT batch transfer (ERC-721 still uses the basic Transfer above)
  // Uniswap V3 swap shape
  swap:     "Swap(address,address,int256,int256,uint160,uint128,int24)",
  // Mint = Transfer where `from == 0x0` — we still register Transfer and
  // let the user filter args.from = '0x0...' in their queries.
};

export interface AbiInput { name: string; type: string; indexed: boolean }

/**
 * Parse a human-readable event signature into:
 *   - canonical signature ("Transfer(address,address,uint256)")
 *   - event name ("Transfer")
 *   - typed inputs (with `indexed` flags)
 *   - keccak256 topic0
 *
 * Accepts either:
 *   - Template alias:  "transfer"
 *   - Compact form:    "Transfer(address,address,uint256)"
 *   - Named form:      "Transfer(address indexed from, address indexed to, uint256 value)"
 */
export function parseEventSignature(input: string): {
  signature:  string;
  name:       string;
  inputs:     AbiInput[];
  topic0:     `0x${string}`;
} {
  const trimmed = input.trim();
  // Template alias?
  const tpl = EVENT_TEMPLATES[trimmed.toLowerCase()];
  const sigSrc = tpl ?? trimmed;

  const openIdx  = sigSrc.indexOf("(");
  const closeIdx = sigSrc.lastIndexOf(")");
  if (openIdx <= 0 || closeIdx !== sigSrc.length - 1) {
    throw new Error(`invalid event signature: expected Name(arg1,arg2,...)`);
  }

  const name    = sigSrc.slice(0, openIdx).trim();
  const argsStr = sigSrc.slice(openIdx + 1, closeIdx).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`invalid event name: ${name}`);
  }

  const inputs: AbiInput[] = [];
  if (argsStr.length > 0) {
    // Split on commas (no nested types supported in MVP — tuples can come later)
    const parts = argsStr.split(",").map((p) => p.trim()).filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const p     = parts[i]!;
      const toks  = p.split(/\s+/);   // ["address", "indexed", "from"] OR ["address"]
      const type  = toks[0]!;
      let indexed = false;
      let argName: string | undefined;
      for (let k = 1; k < toks.length; k++) {
        if (toks[k] === "indexed") indexed = true;
        else argName = toks[k];
      }
      // Validate basic Solidity type
      if (!/^(address|bool|bytes(\d+)?|string|u?int(\d+)?)(\[\d*\])?$/.test(type)) {
        throw new Error(`unsupported type in event sig: ${type}`);
      }
      inputs.push({
        name:    argName ?? `arg${i}`,
        type,
        indexed,
      });
    }
  }

  // Canonical signature (no arg names, no indexed keyword — just types)
  const canonical = `${name}(${inputs.map((i) => i.type).join(",")})`;
  const topic0    = keccak256(toBytes(canonical));

  return {
    signature: canonical,
    name,
    inputs,
    topic0,
  };
}
