import { useMemo } from "react";
import { Mneme } from "@mneme/sdk";
import { useSession } from "./session";

const GATEWAY_URL = import.meta.env.VITE_MNEME_GATEWAY_URL ?? "http://localhost:8787";

/**
 * Returns a Mneme SDK instance authed with the current session JWT, or null
 * if no session is active. All API calls under this client become a single
 * Bearer-token fetch — no per-request wallet signature popup.
 */
export function useMneme(): Mneme | null {
  const { session } = useSession();

  return useMemo(() => {
    if (!session) return null;
    return new Mneme({
      accessToken: session.access_token,
      gatewayUrl:  GATEWAY_URL,
      chainId:     8453,
    });
  }, [session]);
}
