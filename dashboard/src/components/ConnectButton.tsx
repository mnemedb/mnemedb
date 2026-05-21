import { useAccount, useDisconnect } from "wagmi";

/** Header-only wallet pill. Disconnected UI lives in <Landing />. */
export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  if (!isConnected || !address) return null;

  return (
    <button
      onClick={() => disconnect()}
      title="Disconnect"
      className="px-4 py-2 rounded-full bg-ink-800 hover:bg-ink-700 text-sm font-medium border border-ink-700 transition"
    >
      {address.slice(0, 6)}…{address.slice(-4)}
    </button>
  );
}
