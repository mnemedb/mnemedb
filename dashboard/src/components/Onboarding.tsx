import { useState } from "react";
import { useLogout, usePrivy, useSignTypedData } from "@privy-io/react-auth";
import type { Address } from "viem";
import { createProject } from "../lib/onboard";
import { useSession } from "../lib/session";

const HANDLE_RX = /^[a-z0-9_]{3,32}$/;

interface Props {
  onCreated: () => void;
}

export function Onboarding({ onCreated }: Props) {
  const { user } = usePrivy();
  const { logout } = useLogout();
  const { signTypedData } = useSignTypedData();
  const { adopt } = useSession();

  const address = user?.wallet?.address as Address | undefined;

  const [handle, setHandle] = useState("");
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const valid = HANDLE_RX.test(handle);

  const submit = async () => {
    if (!address || !valid) return;
    setBusy(true);
    setError(null);
    const r = await createProject({ signTypedData, wallet: address, handle });
    setBusy(false);
    if (r.ok) {
      adopt(r.session);
      onCreated();
    } else {
      setError(r.error);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-ink-950 px-6">
      <div className="max-w-md w-full bg-ink-900 rounded-2xl p-8 border border-ink-800">
        <div className="flex items-center justify-between text-xs text-ink-500 font-mono mb-4">
          <span>{address?.slice(0, 6)}…{address?.slice(-4)}</span>
          <button
            onClick={() => logout()}
            className="text-ink-500 hover:text-white transition"
          >
            sign out
          </button>
        </div>

        <h1 className="text-2xl font-semibold mb-2">Pick your handle</h1>
        <p className="text-ink-400 text-sm mb-6">
          Your handle names your Mneme project. You'll be reachable as{" "}
          <span className="font-mono">handle.mneme</span>. We provision a
          dedicated Postgres schema with 4 agent tables, ready to use from your
          code, from Claude/Cursor via MCP, and from this dashboard.
        </p>

        <div className="relative">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            placeholder="alice"
            disabled={busy}
            maxLength={32}
            className="w-full bg-ink-950 border border-ink-800 rounded-xl px-4 py-3 pr-20 font-mono text-lg focus:outline-none focus:border-white transition"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-500 font-mono">
            .mneme
          </span>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-950/40 border border-red-900 text-red-300 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={!valid || busy || !address}
          className="w-full mt-6 bg-white text-black py-3 rounded-xl font-medium hover:bg-marble-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {busy ? "Creating…" : "Create my Mneme project"}
        </button>

        <p className="text-xs text-ink-500 mt-4 text-center">
          Signed by your wallet — silent for email/passkey logins. No gas.
        </p>
      </div>
    </div>
  );
}
