import { useQuery } from "@tanstack/react-query";

const GATEWAY =
  import.meta.env.VITE_MNEME_GATEWAY_URL ?? "https://gateway.mnemedb.dev";

type State = "checking" | "operational" | "down";

/**
 * Tiny live status indicator — pings the gateway /health endpoint every 30s.
 * Click takes you to the raw /health response so visitors can verify.
 */
export function StatusBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const { data, isLoading, isError } = useQuery({
    queryKey:        ["mneme:status"],
    refetchInterval: 30_000,
    retry:           1,
    queryFn:         async () => {
      const res = await fetch(`${GATEWAY}/health`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { ok?: boolean };
      return json.ok === true;
    },
  });

  const state: State =
    isLoading ? "checking"
    : isError || data === false ? "down"
    :                              "operational";

  const dotColor =
    state === "operational" ? "bg-emerald-400"
    : state === "down"      ? "bg-red-500"
    :                          "bg-ink-500";

  const label =
    state === "operational" ? "All systems operational"
    : state === "down"      ? "Gateway unreachable"
    :                          "Checking…";

  const textSize = size === "md" ? "text-sm" : "text-xs";

  return (
    <a
      href={`${GATEWAY}/health`}
      target="_blank"
      rel="noreferrer"
      title="Click for raw /health response"
      className={`inline-flex items-center gap-2 ${textSize} text-ink-400 hover:text-white transition`}
    >
      <span className="relative inline-flex">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        {state === "operational" && (
          <span className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-60" />
        )}
      </span>
      <span>{label}</span>
    </a>
  );
}
