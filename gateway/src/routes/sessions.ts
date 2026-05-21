import { Hono } from "hono";
import { z } from "zod";
import type { Address, Hex } from "viem";
import { publicClient } from "../chain";
import { mintSessionJwt, SESSION_LIFETIME_SECONDS } from "../jwt";

const CHAIN_ID       = Number(process.env.CHAIN_ID ?? 8453);
const DOMAIN_NAME    = process.env.MNEME_DOMAIN_NAME ?? "Mneme";
const DOMAIN_VERSION = process.env.MNEME_DOMAIN_VERSION ?? "1";

const sessionTypes = {
  MnemeSession: [
    { name: "wallet",     type: "address" },
    { name: "issued_at",  type: "uint256" },
    { name: "expires_at", type: "uint256" },
    { name: "nonce",      type: "string"  },
  ],
} as const;

const Body = z.object({
  wallet:     z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  signature:  z.string().regex(/^0x[a-fA-F0-9]+$/),
  issued_at:  z.number(),
  expires_at: z.number(),
  nonce:      z.string().min(8),
});

const route = new Hono();

route.post("/", async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);
  const { wallet, signature, issued_at, expires_at, nonce } = parsed.data;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - issued_at) > 300) {
    return c.json({ error: "issued_at out of window" }, 400);
  }
  if (expires_at <= now) {
    return c.json({ error: "session already expired" }, 400);
  }
  if (expires_at - issued_at > SESSION_LIFETIME_SECONDS) {
    return c.json({ error: `session too long (max ${SESSION_LIFETIME_SECONDS}s)` }, 400);
  }

  const valid = await publicClient.verifyTypedData({
    address:     wallet as Address,
    domain:      { name: DOMAIN_NAME, version: DOMAIN_VERSION, chainId: CHAIN_ID },
    types:       sessionTypes,
    primaryType: "MnemeSession",
    message: {
      wallet,
      issued_at:  BigInt(issued_at),
      expires_at: BigInt(expires_at),
      nonce,
    },
    signature: signature as Hex,
  });
  if (!valid) {
    return c.json({ error: "signature does not match wallet" }, 401);
  }

  const access_token = await mintSessionJwt(wallet as `0x${string}`, expires_at);
  return c.json({ access_token, expires_at });
});

export { route as sessionsRoute };
