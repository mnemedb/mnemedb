import type { Address, WalletClient } from "viem";

const GATEWAY = import.meta.env.VITE_MNEME_GATEWAY_URL ?? "http://localhost:8787";

const createTypes = {
  CreateProject: [
    { name: "handle",    type: "string"  },
    { name: "timestamp", type: "uint256" },
  ],
} as const;

export interface OnboardInput {
  walletClient: WalletClient;
  wallet:       Address;
  handle:       string;
}

export type OnboardResult =
  | {
      ok:      true;
      handle:  string;
      session: { access_token: string; expires_at: number };
    }
  | { ok: false; error: string };

/**
 * Sign a CreateProject typed-data message and POST to /projects. On success,
 * the gateway provisions the schema AND mints a session JWT in the same
 * round-trip, so onboarding is exactly one signature.
 */
export async function createProject(input: OnboardInput): Promise<OnboardResult> {
  const timestamp = Math.floor(Date.now() / 1000);

  const signature = await input.walletClient.signTypedData({
    account:     input.wallet,
    domain:      { name: "Mneme", version: "1", chainId: 8453 },
    types:       createTypes,
    primaryType: "CreateProject",
    message: {
      handle:    input.handle,
      timestamp: BigInt(timestamp),
    },
  });

  const res = await fetch(`${GATEWAY}/projects`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet:    input.wallet,
      signature,
      handle:    input.handle,
      timestamp,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?:   unknown;
    project?: { handle: string };
    session?: { access_token: string; expires_at: number };
  };
  if (!res.ok || !json.project || !json.session) {
    const err = json.error;
    return {
      ok:    false,
      error: typeof err === "string" ? err : JSON.stringify(err ?? `HTTP ${res.status}`),
    };
  }
  return { ok: true, handle: json.project.handle, session: json.session };
}
