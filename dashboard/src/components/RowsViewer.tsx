import { useQuery } from "@tanstack/react-query";
import { useMneme } from "../lib/mneme-client";

export function RowsViewer({ table }: { table: string | null }) {
  const mneme = useMneme();

  const { data, isLoading, error } = useQuery({
    queryKey: ["rows", table],
    enabled:  !!mneme && !!table,
    queryFn:  async () => (await mneme!.from(table!).list({ limit: 50 })).rows,
  });

  if (!table)        return <Center msg="Select a table." />;
  if (!mneme)        return <Center msg="Connect a wallet first." />;
  if (isLoading)     return <Center msg="Loading rows…" />;
  if (error)         return <Center msg={`Error: ${(error as Error).message}`} />;
  if (!data?.length) return <Center msg="No rows yet." />;

  const first = data[0] as Record<string, unknown>;
  const columns = Object.keys(first);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-ink-400 border-b border-ink-800 sticky top-0 bg-ink-950">
          <tr>
            {columns.map((c) => (
              <th key={c} className="text-left font-medium px-4 py-3">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-xs">
          {data.map((row, i) => (
            <tr key={i} className="border-b border-ink-900 hover:bg-ink-900/40">
              {columns.map((c) => (
                <td key={c} className="px-4 py-3 align-top">
                  {formatCell((row as Record<string, unknown>)[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Center({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center h-full text-ink-500 text-sm">
      {msg}
    </div>
  );
}
