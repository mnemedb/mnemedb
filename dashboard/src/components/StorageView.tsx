import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { createPublicClient, encodeFunctionData, formatEther, formatUnits, http, parseUnits } from "viem";
import { base } from "viem/chains";
import { useMneme } from "../lib/mneme-client";

const MNEME_TOKEN  = "0x3FcDbEBD5e7BaB79477cFDcA2CDCF6e904C27b07";
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

interface BurnTier { tokens: number; gb: number; label: string }
const BURN_TIERS: BurnTier[] = [
  { tokens:    100_000, gb: 1,   label: "1 GB" },
  { tokens:  1_000_000, gb: 10,  label: "10 GB" },
  { tokens: 10_000_000, gb: 100, label: "100 GB" },
];

const ERC20_TRANSFER_ABI = [{
  type: "function",
  name: "transfer",
  stateMutability: "nonpayable",
  inputs:  [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

const ERC20_BALANCEOF_ABI = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs:  [{ name: "owner", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

const basePublic = createPublicClient({ chain: base, transport: http() });

function useBalances(address?: string) {
  return useQuery({
    queryKey: ["balances", address ?? "none"],
    enabled:  !!address,
    refetchInterval: 15_000,
    queryFn: async () => {
      const addr = address as `0x${string}`;
      const [eth, mneme] = await Promise.all([
        basePublic.getBalance({ address: addr }),
        basePublic.readContract({
          address:     MNEME_TOKEN as `0x${string}`,
          abi:         ERC20_BALANCEOF_ABI,
          functionName: "balanceOf",
          args:        [addr],
        }) as Promise<bigint>,
      ]);
      return { eth, mneme };
    },
  });
}

type Visibility = "public" | "private";

export function StorageView() {
  const mneme = useMneme();
  const qc    = useQueryClient();
  const { wallets } = useWallets();
  const walletAddr = wallets[0]?.address;
  const [tab, setTab]           = useState<Visibility>("public");
  const [burnOpen, setBurnOpen] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileInput               = useRef<HTMLInputElement>(null);

  const { data: balances } = useBalances(walletAddr);

  const { data: quota } = useQuery({
    queryKey: ["storage", "quota"],
    enabled:  !!mneme,
    refetchInterval: 5_000,
    queryFn:  () => mneme!.storage.quota(),
  });

  const { data: listing, isLoading: listLoading } = useQuery({
    queryKey: ["storage", "list", tab],
    enabled:  !!mneme,
    queryFn:  () => mneme!.storage.list({ visibility: tab }),
  });

  const upload = useMutation({
    mutationFn: async (args: { file: File; visibility: Visibility }) => {
      setUploadErr(null);
      const bytes = new Uint8Array(await args.file.arrayBuffer());
      return mneme!.storage.upload({
        key:         args.file.name,
        file:        bytes,
        visibility:  args.visibility,
        contentType: args.file.type || "application/octet-stream",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["storage"] });
    },
    onError: (e: Error) => setUploadErr(e.message),
  });

  const del = useMutation({
    mutationFn: (key: string) => mneme!.storage.delete({ key, visibility: tab }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storage"] }),
  });

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      await upload.mutateAsync({ file: f, visibility: tab });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    void onPickFiles(e.dataTransfer.files);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="text-ink-500 text-xs uppercase tracking-wider">storage</div>
        <h1 className="text-3xl font-semibold mt-1">
          Files <span className="text-gold-300">·</span> Wallet-bound R2
        </h1>
        <div className="text-xs text-ink-500 mt-2">
          Each upload is keyed under <code className="font-mono text-gold-300/80">{`<handle>/<visibility>/<key>`}</code>.
          Public files are served from <code className="font-mono text-gold-300/80">cdn.mnemedb.dev</code>.
          Private files require presigned URLs.
        </div>
      </div>

      {/* ─── Quota meter ─────────────────────────────────────────────── */}
      <QuotaMeter quota={quota} balances={balances} onBurnClick={() => setBurnOpen(true)} />

      {/* ─── Upload zone ─────────────────────────────────────────────── */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInput.current?.click()}
        className="mt-6 border-2 border-dashed border-ink-800 hover:border-gold-300/40 rounded-xl p-10 text-center cursor-pointer transition bg-ink-950/60"
      >
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onPickFiles(e.target.files)}
        />
        <div className="text-sm text-ink-400">
          {upload.isPending
            ? "Uploading…"
            : <>Drag files here, or <span className="text-gold-300 underline">click to choose</span></>}
        </div>
        <div className="text-xs text-ink-600 mt-1">
          Visibility will be <code className="font-mono text-gold-300/80">{tab}</code>. Max 10 MB per file.
        </div>
        {uploadErr && (
          <div className="text-xs text-red-400 mt-3">{uploadErr}</div>
        )}
      </div>

      {/* ─── Tabs ────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mt-8 border-b border-ink-900">
        <Tab active={tab === "public"}  label="Public"  onClick={() => setTab("public")} />
        <Tab active={tab === "private"} label="Private" onClick={() => setTab("private")} />
      </div>

      {/* ─── File list ───────────────────────────────────────────────── */}
      <div className="mt-4">
        {listLoading
          ? <Skeleton />
          : !listing?.objects?.length
            ? <Empty visibility={tab} />
            : (
              <div className="divide-y divide-ink-900">
                {listing.objects.map((o) => (
                  <FileRow
                    key={o.key}
                    name={o.key}
                    size={o.size}
                    publicUrl={o.public_url}
                    visibility={tab}
                    onDelete={() => del.mutate(o.key)}
                    onPresign={async () => {
                      const { url } = await mneme!.storage.url({
                        key: o.key, visibility: tab, expiresIn: 900,
                      });
                      await navigator.clipboard.writeText(url);
                      alert("Presigned URL copied (valid 15 min)");
                    }}
                  />
                ))}
              </div>
            )
        }
      </div>

      {burnOpen && (
        <BurnModal
          onClose={() => setBurnOpen(false)}
          onCredited={() => {
            qc.invalidateQueries({ queryKey: ["storage"] });
            setBurnOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Quota meter ─────────────────────────────────────────────────────────
function QuotaMeter({
  quota, balances, onBurnClick,
}: {
  quota?: { bytes_used: number; bytes_limit: number; bytes_available: number; free_tier_bytes: number; bonus_expires_at: string | null };
  balances?: { eth: bigint; mneme: bigint };
  onBurnClick: () => void;
}) {
  if (!quota) return <div className="h-24 rounded-xl bg-ink-900 animate-pulse" />;
  const pct = Math.min(100, Math.round((quota.bytes_used / Math.max(1, quota.bytes_limit)) * 100));
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div className="text-ink-500 text-xs uppercase tracking-wider">storage used</div>
          <div className="font-mono text-2xl mt-1">
            {fmt(quota.bytes_used)} <span className="text-ink-500 text-base">/ {fmt(quota.bytes_limit)}</span>
          </div>
        </div>
        <button
          onClick={onBurnClick}
          className="px-3 py-1.5 rounded-lg bg-gold-300/10 border border-gold-300/30 text-gold-300 text-sm hover:bg-gold-300/20 transition"
        >
          Burn $MNEME for more
        </button>
      </div>
      <div className="h-2 bg-ink-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-gold-300 to-gold-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-ink-500 mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span>{fmt(quota.bytes_available)} available · free tier {fmt(quota.free_tier_bytes)}</span>
        <span className="flex items-center gap-3">
          {balances && (
            <>
              <span><span className="text-ink-400">balance:</span> <span className="text-gold-300/90 font-mono">{fmtToken(balances.mneme, 18)}</span> $MNEME</span>
              <span><span className="text-ink-400">·</span> <span className="font-mono">{fmtEth(balances.eth)}</span> ETH</span>
            </>
          )}
          {quota.bonus_expires_at && (
            <span className="text-gold-300/80">bonus expires {new Date(quota.bonus_expires_at).toLocaleDateString()}</span>
          )}
        </span>
      </div>
    </div>
  );
}

// ─── File row ───────────────────────────────────────────────────────────
function FileRow({
  name, size, publicUrl, visibility, onDelete, onPresign,
}: {
  name: string; size: number; publicUrl?: string; visibility: Visibility;
  onDelete: () => void; onPresign: () => void;
}) {
  return (
    <div className="py-3 flex items-center gap-3 group">
      <div className="flex-1 min-w-0">
        <div className="font-mono text-sm truncate">{name}</div>
        <div className="text-xs text-ink-500">{fmt(size)}</div>
      </div>
      {visibility === "public" && publicUrl
        ? (
          <a
            href={publicUrl} target="_blank" rel="noreferrer"
            className="text-xs text-gold-300/80 hover:text-gold-300 underline truncate max-w-xs"
          >
            {publicUrl.replace(/^https?:\/\//, "")}
          </a>
        )
        : (
          <button
            onClick={onPresign}
            className="text-xs text-ink-400 hover:text-white px-2 py-1 rounded border border-ink-800"
          >
            Copy presigned URL
          </button>
        )
      }
      <button
        onClick={() => confirm(`Delete ${name}?`) && onDelete()}
        className="text-xs text-red-400/70 hover:text-red-400 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition"
      >
        Delete
      </button>
    </div>
  );
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm transition border-b-2 -mb-px ${
        active ? "border-gold-300 text-white" : "border-transparent text-ink-500 hover:text-ink-300"
      }`}
    >
      {label}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {[1,2,3].map((i) => (
        <div key={i} className="h-12 rounded bg-ink-900 animate-pulse" />
      ))}
    </div>
  );
}

function Empty({ visibility }: { visibility: Visibility }) {
  return (
    <div className="text-center py-12 text-ink-500 text-sm italic">
      No {visibility} files yet. Drag one in above.
    </div>
  );
}

// ─── Burn modal — Privy sends ERC20 transfer to 0xdEaD, then credits ────
function BurnModal({ onClose, onCredited }: { onClose: () => void; onCredited: () => void }) {
  const mneme = useMneme();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const [selected, setSelected] = useState<BurnTier>(BURN_TIERS[0]!);
  const [stage, setStage]       = useState<"idle" | "signing" | "verifying" | "done" | "error">("idle");
  const [txHash, setTxHash]     = useState<string | null>(null);
  const [err, setErr]           = useState<string | null>(null);

  const wallet = wallets[0];
  const { data: balances } = useBalances(wallet?.address);
  const mnemeBalance = balances ? Number(formatUnits(balances.mneme, 18)) : null;
  const ethBalance   = balances ? Number(formatEther(balances.eth))       : null;
  const canAfford    = mnemeBalance !== null && mnemeBalance >= selected.tokens;
  const hasGas       = ethBalance   !== null && ethBalance   >= 0.0005;       // ~enough for the burn tx

  const doBurn = async () => {
    if (!wallet || !mneme) return;
    setErr(null);
    setStage("signing");
    try {
      const amountRaw = parseUnits(String(selected.tokens), 18);
      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [BURN_ADDRESS as `0x${string}`, amountRaw],
      });
      const { hash } = await sendTransaction({
        to:    MNEME_TOKEN as `0x${string}`,
        data,
        value: 0n,
      });
      setTxHash(hash);
      setStage("verifying");
      // Give the tx a few seconds to mine before we ask the gateway to verify.
      // Gateway will retry the receipt fetch internally.
      await new Promise((r) => setTimeout(r, 4000));
      await mneme.storage.burn({ tx_hash: hash });
      setStage("done");
      setTimeout(onCredited, 1200);
    } catch (e) {
      setStage("error");
      setErr((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-ink-900 border border-ink-800 rounded-xl max-w-md w-full p-6">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-xl font-semibold">Burn $MNEME for storage</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <p className="text-xs text-ink-500 mb-4">
          $MNEME is permanently sent to <code className="font-mono">0x…dEaD</code>.
          Each burn is verified on-chain and credits 30 days of bonus capacity.
        </p>

        {/* Balance pill */}
        {balances && (
          <div className="flex items-center justify-between text-xs bg-ink-950 border border-ink-800 rounded-lg px-3 py-2 mb-4">
            <span className="text-ink-400">your wallet</span>
            <span className="flex items-center gap-3 font-mono">
              <span className="text-gold-300/90">{fmtToken(balances.mneme, 18)} $MNEME</span>
              <span className="text-ink-600">·</span>
              <span className={hasGas ? "text-ink-300" : "text-red-400"}>{fmtEth(balances.eth)} ETH</span>
            </span>
          </div>
        )}

        <div className="space-y-2 mb-4">
          {BURN_TIERS.map((t) => {
            const affordable = mnemeBalance === null || mnemeBalance >= t.tokens;
            return (
              <button
                key={t.tokens}
                onClick={() => setSelected(t)}
                className={`w-full flex items-baseline justify-between px-4 py-3 rounded-lg border transition ${
                  selected.tokens === t.tokens
                    ? "border-gold-300 bg-gold-300/5"
                    : "border-ink-800 hover:border-ink-700"
                } ${!affordable ? "opacity-40" : ""}`}
              >
                <span className="font-mono flex items-center gap-2">
                  {t.tokens.toLocaleString()} $MNEME
                  {!affordable && <span className="text-[10px] uppercase tracking-wider text-red-400/80">insufficient</span>}
                </span>
                <span className="text-gold-300">{t.label} / 30d</span>
              </button>
            );
          })}
        </div>

        {!hasGas && balances && (
          <div className="text-xs text-red-400/90 bg-red-500/5 border border-red-500/30 rounded-lg p-3 mb-3">
            <div className="font-semibold mb-1">⚠ Not enough ETH for gas</div>
            <div className="text-ink-300">
              You need ~0.0005 ETH on Base to send the burn tx. Send a small
              amount of ETH to <code className="font-mono text-ink-100">{wallet?.address?.slice(0, 8)}…{wallet?.address?.slice(-6)}</code>{" "}
              (Base network) and try again.
            </div>
          </div>
        )}

        {stage === "idle" && (
          <button
            onClick={doBurn}
            disabled={!wallet || !canAfford || !hasGas}
            className="w-full py-3 rounded-lg bg-gold-300 hover:bg-gold-200 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold transition"
          >
            {!canAfford ? `Need ${selected.tokens.toLocaleString()} $MNEME` :
             !hasGas    ? "Need ETH for gas"                                 :
             `Burn ${selected.tokens.toLocaleString()} $MNEME`}
          </button>
        )}
        {stage === "signing"   && <Status text="Waiting for wallet signature…" />}
        {stage === "verifying" && (
          <Status text="Verifying burn on Base… this can take ~10 seconds" sub={txHash ? `tx ${txHash.slice(0, 10)}…${txHash.slice(-6)}` : undefined} />
        )}
        {stage === "done"      && <Status text="✓ Burn credited. Quota extended." />}
        {stage === "error"     && (
          <>
            <div className="text-sm text-red-400 mb-3">{err}</div>
            <button onClick={() => setStage("idle")} className="w-full py-2 rounded-lg border border-ink-800 hover:bg-ink-800 transition text-sm">
              Try again
            </button>
          </>
        )}

        <div className="text-[11px] text-ink-600 mt-4 leading-relaxed">
          You need $MNEME in this wallet. Buy on Uniswap V4 (Base) at{" "}
          <a
            href={`https://dexscreener.com/base/${MNEME_TOKEN}`}
            target="_blank" rel="noreferrer"
            className="underline text-gold-300/80 hover:text-gold-300"
          >
            dexscreener
          </a>.
        </div>
      </div>
    </div>
  );
}

function Status({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="text-center py-2">
      <div className="text-sm text-ink-300">{text}</div>
      {sub && <div className="text-xs text-ink-500 font-mono mt-1">{sub}</div>}
    </div>
  );
}

// ─── Format helpers ──────────────────────────────────────────────────────
function fmt(bytes: number): string {
  if (bytes < 1024)               return `${bytes} B`;
  if (bytes < 1024 * 1024)        return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtToken(raw: bigint, decimals: number): string {
  const whole = Number(formatUnits(raw, decimals));
  if (whole === 0)         return "0";
  if (whole < 0.01)        return whole.toFixed(4);
  if (whole < 1)           return whole.toFixed(3);
  if (whole < 1000)        return whole.toFixed(2);
  if (whole < 1_000_000)   return `${(whole / 1000).toFixed(1)}k`;
  return `${(whole / 1_000_000).toFixed(2)}M`;
}

function fmtEth(raw: bigint): string {
  const v = Number(formatEther(raw));
  if (v === 0)     return "0";
  if (v < 0.0001)  return v.toExponential(2);
  if (v < 1)       return v.toFixed(4);
  return v.toFixed(3);
}
