import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy, useSignTypedData } from "@privy-io/react-auth";
import type { Address } from "viem";

const GATEWAY = import.meta.env.VITE_MNEME_GATEWAY_URL ?? "http://localhost:8787";
const SESSION_LIFETIME = 86_400; // 24h
const STORAGE_PREFIX = "mneme:session:";

const sessionTypes = {
  MnemeSession: [
    { name: "wallet",     type: "address" },
    { name: "issued_at",  type: "uint256" },
    { name: "expires_at", type: "uint256" },
    { name: "nonce",      type: "string"  },
  ],
};

export interface Session {
  wallet:       Address;
  access_token: string;
  expires_at:   number;
}

const QK_SESSION = ["mneme", "session"] as const;

function storageKey(wallet: Address) {
  return STORAGE_PREFIX + wallet.toLowerCase();
}

function loadFromStorage(wallet: Address): Session | null {
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (s.expires_at < Math.floor(Date.now() / 1000) + 60) {
      localStorage.removeItem(storageKey(wallet));
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function saveToStorage(s: Session) {
  localStorage.setItem(storageKey(s.wallet), JSON.stringify(s));
}

function clearStorage(wallet: Address) {
  localStorage.removeItem(storageKey(wallet));
}

/**
 * Mneme session backed by a Privy wallet (embedded or connected). Uses Privy's
 * useSignTypedData hook directly — bypasses wagmi to avoid the post-login race
 * where wagmi's useWalletClient lags behind Privy auth state.
 */
export function useSession() {
  const qc = useQueryClient();
  const { user } = usePrivy();
  const { signTypedData } = useSignTypedData();
  const address = user?.wallet?.address as Address | undefined;

  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = [...QK_SESSION, address?.toLowerCase() ?? ""];

  const { data: session = null } = useQuery<Session | null>({
    queryKey:  key,
    queryFn:   () => (address ? loadFromStorage(address) : null),
    enabled:   !!address,
    staleTime: Infinity,
  });

  const adopt = useCallback(
    (s: Omit<Session, "wallet">) => {
      if (!address) return;
      const full: Session = { wallet: address, ...s };
      saveToStorage(full);
      qc.setQueryData([...QK_SESSION, address.toLowerCase()], full);
    },
    [address, qc],
  );

  const clear = useCallback(() => {
    if (!address) return;
    clearStorage(address);
    qc.setQueryData([...QK_SESSION, address.toLowerCase()], null);
  }, [address, qc]);

  const sign = useCallback(async (): Promise<Session | null> => {
    if (!address) {
      setError("wallet not ready");
      return null;
    }
    setBusy(true);
    setError(null);

    try {
      const issued_at  = Math.floor(Date.now() / 1000);
      const expires_at = issued_at + SESSION_LIFETIME;
      const nonce      = crypto.randomUUID();

      // Privy embedded wallets sign silently (no popup) when the user already
      // authenticated via Privy. External wallets (MetaMask) show their own popup.
      // Pass uint256 values as plain numbers, not BigInt — Privy serializes
      // the message to JSON internally and BigInt isn't JSON-serializable.
      // Hash is identical (EIP-712 normalises any numeric form to 32-byte BE).
      const result = await signTypedData(
        {
          domain:      { name: "Mneme", version: "1", chainId: 8453 },
          types:       sessionTypes,
          primaryType: "MnemeSession",
          message: {
            wallet:     address,
            issued_at,
            expires_at,
            nonce,
          },
        },
        { uiOptions: { showWalletUIs: false } },
      );
      const signature = typeof result === "string" ? result : result.signature;

      const res = await fetch(`${GATEWAY}/sessions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: address,
          signature,
          issued_at,
          expires_at,
          nonce,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: unknown; access_token?: string; expires_at?: number;
      };
      if (!res.ok) {
        const e = typeof json.error === "string"
          ? json.error
          : JSON.stringify(json.error ?? "session failed");
        setError(e);
        return null;
      }
      const full: Session = {
        wallet:       address,
        access_token: json.access_token!,
        expires_at:   json.expires_at!,
      };
      saveToStorage(full);
      qc.setQueryData([...QK_SESSION, address.toLowerCase()], full);
      return full;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [signTypedData, address, qc]);

  return { session, sign, adopt, clear, busy, error, address };
}
