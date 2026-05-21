import { useQuery } from "@tanstack/react-query";
import type { TableInfo } from "@mneme/sdk";
import { useMneme } from "../lib/mneme-client";

interface Props {
  selected: string | null;
  onSelect: (table: string) => void;
}

export function TableList({ selected, onSelect }: Props) {
  const mneme = useMneme();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tables"],
    enabled:  !!mneme,
    queryFn:  async () => (await mneme!.listTables()).tables,
  });

  if (!mneme)        return <Hint msg="Connect a wallet to see your tables." />;
  if (isLoading)     return <Hint msg="Loading…" />;
  if (error)         return <Hint msg={`Error: ${(error as Error).message}`} />;
  if (!data?.length) return <Hint msg="No tables yet." />;

  const sorted = [...data].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <ul className="flex flex-col gap-1">
      {sorted.map((t) => (
        <li key={t.name}>
          <TableRow
            table={t}
            active={selected === t.name}
            onClick={() => onSelect(t.name)}
          />
        </li>
      ))}
    </ul>
  );
}

function TableRow({
  table, active, onClick,
}: {
  table:   TableInfo;
  active:  boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between gap-2 ${
        active
          ? "bg-ink-800 text-white"
          : "text-ink-400 hover:bg-ink-900 hover:text-white"
      }`}
    >
      <span className="font-mono truncate">{table.name}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs text-ink-500 font-mono">{table.rowCount}</span>
        {!table.isDefault && (
          <span className="text-[10px] uppercase tracking-wider text-gold-300/80 border border-gold-300/30 rounded px-1.5 py-px">
            custom
          </span>
        )}
      </span>
    </button>
  );
}

function Hint({ msg }: { msg: string }) {
  return <p className="text-sm text-ink-500 px-3 py-2">{msg}</p>;
}
