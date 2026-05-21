import { SignJWT, jwtVerify } from "jose";
import type { Address } from "viem";

const SECRET = process.env.GATEWAY_JWT_SECRET;
if (!SECRET) throw new Error("GATEWAY_JWT_SECRET not set");
if (SECRET.length < 32) throw new Error("GATEWAY_JWT_SECRET must be at least 32 chars");

const key = new TextEncoder().encode(SECRET);

export const SESSION_LIFETIME_SECONDS = 86_400; // 24h

export interface SessionPayload {
  wallet: Address;
  exp:    number;
}

/** Issue a gateway-signed session JWT carrying the caller's wallet. */
export async function mintSessionJwt(wallet: Address, expiresAt: number): Promise<string> {
  return await new SignJWT({ wallet: wallet.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setSubject(wallet.toLowerCase())
    .sign(key);
}

/** Verify a session JWT and extract the wallet + expiry. Returns null on any failure. */
export async function verifySessionJwt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const wallet =
      (typeof payload.wallet === "string" ? payload.wallet : undefined) ??
      (typeof payload.sub === "string" ? payload.sub : undefined);
    if (!wallet || typeof payload.exp !== "number") return null;
    return { wallet: wallet as Address, exp: payload.exp };
  } catch {
    return null;
  }
}
