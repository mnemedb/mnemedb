import { Hono } from "hono";
import { z } from "zod";
import type { Address, Hex } from "viem";
import { publicClient } from "../chain";
import { createProject, getProjectForWallet } from "../db";
import { mintSessionJwt, SESSION_LIFETIME_SECONDS } from "../jwt";
import type { StatusCode } from "hono/utils/http-status";

const CHAIN_ID       = Number(process.env.CHAIN_ID ?? 8453);
const DOMAIN_NAME    = process.env.MNEME_DOMAIN_NAME ?? "Mneme";
const DOMAIN_VERSION = process.env.MNEME_DOMAIN_VERSION ?? "1";

const createTypes = {
  CreateProject: [
    { name: "handle",    type: "string"  },
    { name: "timestamp", type: "uint256" },
  ],
} as const;

const CreateBody = z.object({
  wallet:    z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  handle:    z.string().regex(/^[a-z0-9_]{3,32}$/),
  timestamp: z.number(),
});

// ---------------------------------------------------------------------------
// PUBLIC: POST /projects  — create a Mneme project.
// Verifies a CreateProject typed-data sig (EOA via ECDSA, smart wallet via
// ERC-1271 / 6492), provisions a schema, AND mints a session JWT so the
// freshly-created project starts with an active session. One signature.
// ---------------------------------------------------------------------------
export const projectsPublic = new Hono();

projectsPublic.post("/", async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);
  const { wallet, signature, handle, timestamp } = parsed.data;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return c.json({ error: "timestamp out of window" }, 400);
  }

  const valid = await publicClient.verifyTypedData({
    address:     wallet as Address,
    domain:      { name: DOMAIN_NAME, version: DOMAIN_VERSION, chainId: CHAIN_ID },
    types:       createTypes,
    primaryType: "CreateProject",
    message:     { handle, timestamp: BigInt(timestamp) },
    signature:   signature as Hex,
  });
  if (!valid) {
    return c.json({ error: "signature does not match wallet" }, 401);
  }

  const existing = await getProjectForWallet(wallet);
  if (existing) {
    return c.json({ error: "wallet already has a project", handle: existing.handle }, 409);
  }

  try {
    const project = await createProject({ owner_wallet: wallet, handle });
    const expires_at = Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS;
    const access_token = await mintSessionJwt(wallet as `0x${string}`, expires_at);
    return c.json({
      ok: true,
      project: { id: project.id, handle: project.handle },
      session: { access_token, expires_at },
    });
  } catch (e) {
    const msg = (e as Error).message;
    const conflict = /unique|duplicate|already/i.test(msg);
    return c.json({ error: msg }, (conflict ? 409 : 500) as StatusCode);
  }
});

// ---------------------------------------------------------------------------
// AUTHED: GET /v1/projects/me  — return current project info (no secrets).
// ---------------------------------------------------------------------------
export const projectsMe = new Hono();

projectsMe.get("/", (c) => {
  const project = c.get("project");
  return c.json({
    project: {
      handle:      project.handle,
      owner:       project.owner_wallet,
      schema_name: project.schema_name,
    },
  });
});
