import { useState } from "react";
import { TableList } from "./TableList";
import { RowsViewer } from "./RowsViewer";

export function TablesView() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="flex h-full">
      <aside className="w-60 border-r border-ink-900 p-3 overflow-y-auto">
        <div className="text-xs uppercase tracking-wider text-ink-500 px-3 py-2">
          Tables
        </div>
        <TableList selected={selected} onSelect={setSelected} />
      </aside>
      <main className="flex-1 overflow-auto">
        <RowsViewer table={selected} />
      </main>
    </div>
  );
}
