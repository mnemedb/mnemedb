import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DOCS_SECTIONS, type DocSection } from "../lib/docs-content";

export function Docs() {
  const [activeId, setActiveId] = useState<string>(() => {
    const hash = window.location.hash.replace("#", "");
    return DOCS_SECTIONS.find((s) => s.id === hash)?.id ?? DOCS_SECTIONS[0]!.id;
  });

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.replace("#", "");
      const match = DOCS_SECTIONS.find((s) => s.id === hash);
      if (match) setActiveId(match.id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const active = DOCS_SECTIONS.find((s) => s.id === activeId) ?? DOCS_SECTIONS[0]!;

  return (
    <div className="min-h-screen bg-ink-950 text-white font-sans antialiased">
      {/* Top bar */}
      <header className="border-b border-ink-900 px-6 py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5">
          <img src="/mnemelogo.png" alt="Mneme" className="h-7 w-auto" />
          <span className="font-semibold tracking-tight">Mneme</span>
          <span className="text-ink-500">·</span>
          <span className="text-ink-300 text-sm">docs</span>
        </a>
        <div className="text-xs text-ink-500">
          <a href="/" className="hover:text-white transition">← Back to app</a>
          <span className="mx-3">·</span>
          <a href="https://github.com/mnemedb/mnemedb" target="_blank" rel="noreferrer" className="hover:text-white transition">GitHub</a>
        </div>
      </header>

      <div className="grid grid-cols-12 max-w-7xl mx-auto">
        {/* Sidebar */}
        <aside className="col-span-3 border-r border-ink-900 min-h-screen py-8 px-4 sticky top-0 self-start">
          <DocsNav active={activeId} onSelect={setActiveId} />
        </aside>

        {/* Content */}
        <main className="col-span-9 px-10 py-12 max-w-4xl">
          <div className="prose-mneme">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {active.content}
            </ReactMarkdown>
          </div>
        </main>
      </div>
    </div>
  );
}

function DocsNav({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  // Group by category
  const grouped = DOCS_SECTIONS.reduce((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {} as Record<string, DocSection[]>);

  return (
    <nav className="space-y-6 text-sm">
      {Object.entries(grouped).map(([category, sections]) => (
        <div key={category}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500 px-3 mb-2">{category}</div>
          <div className="space-y-0.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => { onSelect(s.id); window.location.hash = s.id; window.scrollTo({ top: 0, behavior: "instant" }); }}
                className={`w-full text-left px-3 py-1.5 rounded transition ${
                  active === s.id
                    ? "bg-gold-300/10 text-gold-300 border-l-2 border-gold-300"
                    : "text-ink-300 hover:bg-ink-900 hover:text-white border-l-2 border-transparent"
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
