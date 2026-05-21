import { useLogout, usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

/** Header-only wallet pill. Click → Privy logout. */
export function ConnectButton() {
  const { authenticated, user } = usePrivy();
  const { logout } = useLogout();
  const { address } = useAccount();

  if (!authenticated || !user) return null;

  // Prefer wagmi address (most accurate post-wallet-creation); fall back to
  // Privy's user.wallet?.address if wagmi hasn't picked it up yet.
  const wallet = address ?? user.wallet?.address;
  if (!wallet) return null;

  // Show login method label (email, google, etc.) for context.
  const method =
    user.email?.address  ? "email"   :
    user.google?.subject ? "google"  :
    user.twitter?.subject ? "x"      :
    user.apple?.subject  ? "apple"   :
                            "wallet";

  return (
    <button
      onClick={() => logout()}
      title={`Signed in via ${method} · click to sign out`}
      className="px-4 py-2 rounded-full bg-ink-800 hover:bg-ink-700 text-sm font-medium border border-ink-700 transition flex items-center gap-2"
    >
      <span className="font-mono">{wallet.slice(0, 6)}…{wallet.slice(-4)}</span>
      <span className="text-[10px] text-ink-500 uppercase tracking-wider">{method}</span>
    </button>
  );
}
