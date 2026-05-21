import { useAccount, useDisconnect } from "wagmi";
import { useSession } from "../lib/session";

interface Props {
  onSignedIn:  () => void;
  onCreateNew: () => void;
}

export function SignInGate({ onSignedIn, onCreateNew }: Props) {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { sign, busy, error } = useSession();

  const handleSignIn = async () => {
    const s = await sign();
    if (s) onSignedIn();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-ink-950 px-6">
      <div className="max-w-md w-full bg-ink-900 rounded-2xl p-8 border border-ink-800">
        <div className="flex items-center justify-between text-xs text-ink-500 font-mono mb-4">
          <span>{address?.slice(0, 6)}…{address?.slice(-4)}</span>
          <button
            onClick={() => disconnect()}
            className="text-ink-500 hover:text-white transition"
          >
            disconnect
          </button>
        </div>

        <h1 className="text-2xl font-semibold mb-2">Welcome to Mneme</h1>
        <p className="text-ink-400 text-sm mb-6">
          Sign in to your existing project, or create a new one. Either way it's
          one signature — no gas, no transactions.
        </p>

        <button
          onClick={handleSignIn}
          disabled={busy}
          className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-marble-100 disabled:opacity-50 transition mb-3"
        >
          {busy ? "Signing in…" : "Sign in to existing project"}
        </button>

        <button
          onClick={onCreateNew}
          disabled={busy}
          className="w-full bg-ink-800 hover:bg-ink-700 text-white border border-ink-700 py-3 rounded-xl font-medium disabled:opacity-50 transition"
        >
          Create a new project
        </button>

        {error && (
          <div className="mt-4 rounded-lg bg-red-950/40 border border-red-900 text-red-300 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="mt-6 rounded-lg border border-ink-800 bg-ink-950/50 px-3 py-2 text-xs text-ink-400 leading-relaxed">
          <span className="text-gold-300 font-medium">Heads up:</span>{" "}
          your wallet may ask for "access to balance" and "permission to send
          transaction requests" — that's a generic prompt every wallet shows.
          Mneme only ever asks you to <strong>sign a message</strong> — never an
          onchain transaction. No gas, no funds moved.
        </div>

        <p className="text-xs text-ink-500 mt-4 text-center">
          One signature per 24 hours. Session stays in your browser.
        </p>
      </div>
    </div>
  );
}
