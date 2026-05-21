import type { Context, MiddlewareHandler } from "hono";
import {
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { publicClient } from "./chain";
import { getProjectForWallet, type Project } from "./db";
import { verifySessionJwt } from "./jwt";

const DOMAIN_NAME    = process.env.MNEME_DOMAIN_NAME    ?? "Mneme";
const DOMAIN_VERSION = process.env.MNEME_DOMAIN_VERSION ?? "1";
const CHAIN_ID       = Number(process.env.CHAIN_ID ?? 8453);
const SIG_WINDOW     = Number(process.env.SIG_WINDOW_SECONDS ?? 60);

const seenNonces = new Map<string, number>();

const types = {
  MnemeRequest: [
    { name: "method",    type: "string"  },
    { name: "path",      type: "string"  },
    { name: "bodyHash",  type: "bytes32" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce",     type: "string"  },
  ],
} as const;

declare module "hono" {
  interface ContextVariableMap {
    wallet:   Address;
    project:  Project;
    bodyText: string;
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization") ?? "";
  let wallet: Address;
  let bodyText: string;

  if (authHeader.startsWith("Bearer ")) {
    // Session JWT path — used by dashboards / apps with a stable session.
    const token = authHeader.slice(7).trim();
    const payload = await verifySessionJwt(token);
    if (!payload) return c.json({ error: "invalid or expired session" }, 401);
    wallet   = payload.wallet;
    bodyText = await c.req.raw.clone().text();
  } else if (authHeader.startsWith("Mneme ")) {
    // Per-request EIP-712 sig path — used by SDK / agents (no session needed).
    const sigResult = await verifyPerRequestSig(c);
    if (!sigResult.ok) return c.json({ error: sigResult.error }, sigResult.status);
    wallet   = sigResult.wallet;
    bodyText = sigResult.bodyText;
  } else {
    return c.json({ error: "missing auth (Bearer session or Mneme sig required)" }, 401);
  }

  const project = await getProjectForWallet(wallet);
  if (!project) {
    return c.json(
      { error: "no project for this wallet. visit the dashboard to create one." },
      404,
    );
  }

  c.set("wallet", wallet);
  c.set("project", project);
  c.set("bodyText", bodyText);
  await next();
};

type SigVerifyResult =
  | { ok: true;  wallet: Address; bodyText: string }
  | { ok: false; error: string; status: 401 | 400 };

async function verifyPerRequestSig(c: Context): Promise<SigVerifyResult> {
  const wallet = c.req.header("X-Mneme-Wallet") as Address | undefined;
  const ts     = c.req.header("X-Mneme-Timestamp");
  const nonce  = c.req.header("X-Mneme-Nonce");
  const sig    = c.req.header("Authorization")?.replace(/^Mneme\s+/, "") as Hex | undefined;

  if (!wallet || !ts || !nonce || !sig) {
    return { ok: false, error: "missing per-request sig headers", status: 401 };
  }

  const tsNum = Number(ts);
  const now   = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > SIG_WINDOW) {
    return { ok: false, error: "timestamp out of window", status: 401 };
  }

  for (const [n, exp] of seenNonces) if (exp < now) seenNonces.delete(n);
  if (seenNonces.has(nonce)) {
    return { ok: false, error: "nonce already used", status: 401 };
  }

  const bodyText = await c.req.raw.clone().text();
  const bodyHash = keccak256(toBytes(bodyText));

  // Include query string so GETs with ?limit/?offset sign correctly.
  const url = new URL(c.req.url);
  const pathWithQuery = url.pathname + url.search;

  // verifyTypedData handles EOA (offline ECDSA) AND smart-wallet (ERC-1271/6492)
  // sigs uniformly. Smart-wallet sigs cost one eth_call; EOAs are free.
  const valid = await publicClient.verifyTypedData({
    address: wallet,
    domain:  { name: DOMAIN_NAME, version: DOMAIN_VERSION, chainId: CHAIN_ID },
    types,
    primaryType: "MnemeRequest",
    message: {
      method:    c.req.method,
      path:      pathWithQuery,
      bodyHash,
      timestamp: BigInt(tsNum),
      nonce,
    },
    signature: sig,
  });

  if (!valid) {
    return { ok: false, error: "signature does not match wallet", status: 401 };
  }

  seenNonces.set(nonce, now + SIG_WINDOW);
  return { ok: true, wallet, bodyText };
}
