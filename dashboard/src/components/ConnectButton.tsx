import { useEffect, useRef, useState } from "react";
import {
  useExportWallet,
  useLogout,
  usePrivy,
} from "@privy-io/react-auth";

/** Header wallet pill — opens a dropdown with copy / export / sign out. */
export function ConnectButton() {
  const { authenticated, user } = usePrivy();
  const { logout } = useLogout();
  const { exportWallet } = useExportWallet();

  const [open, setOpen]     = useState(false);
  const [copied, setCopied] = useState(false);
  const ref                 = useRef<HTMLDivElement>(null);

  // Close menu on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!authenticated || !user) return null;
  const wallet = user.wallet?.address;
  if (!wallet) return null;

  const method =
    user.email?.address   ? "email"
    : user.google?.subject  ? "google"
    : user.twitter?.subject ? "x"
    : user.apple?.subject   ? "apple"
    :                          "wallet";

  // Privy-managed (embedded) wallets are exportable; external (MetaMask etc.) aren't.
  const isEmbedded = user.wallet?.walletClientType === "privy";

  const copy = async () => {
    try { await navigator.clipboard.writeText(wallet); } catch { /* noop */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleExport = async () => {
    try { await exportWallet(); } catch (e) { console.error("export failed:", e); }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Wallet menu"
        className="px-4 py-2 rounded-full bg-ink-800 hover:bg-ink-700 text-sm font-medium border border-ink-700 transition flex items-center gap-2"
      >
        <span className="font-mono">{wallet.slice(0, 6)}…{wallet.slice(-4)}</span>
        <span className="text-[10px] text-ink-500 uppercase tracking-wider">{method}</span>
        <span className={`text-ink-500 transition-transform text-[10px] ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-ink-900 border border-ink-800 rounded-xl shadow-2xl shadow-black/60 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-800">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">
              wallet address
            </div>
            <div className="font-mono text-xs text-ink-300 break-all">{wallet}</div>
            <div className="text-[10px] text-ink-500 mt-2">
              signed in via {method} · {isEmbedded ? "embedded (passkey)" : "external wallet"}
            </div>
          </div>

          <button
            onClick={copy}
            className="w-full text-left px-4 py-3 text-sm hover:bg-ink-800 transition flex items-center justify-between"
          >
            <span>Copy address</span>
            <span className="text-xs text-ink-500">{copied ? "copied" : "⧉"}</span>
          </button>

          {isEmbedded && (
            <button
              onClick={handleExport}
              className="w-full text-left px-4 py-3 text-sm hover:bg-ink-800 transition border-t border-ink-800/60"
            >
              <div>Export wallet for MCP</div>
              <div className="text-[10px] text-ink-500 mt-0.5">
                Privy opens a secure modal — reveal your private key, paste into the MCP config to use this same project from Claude/Cursor.
              </div>
            </button>
          )}

          <button
            onClick={() => { logout(); setOpen(false); }}
            className="w-full text-left px-4 py-3 text-sm hover:bg-ink-800 transition text-red-400 border-t border-ink-800/60"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
