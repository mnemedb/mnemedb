import { useEffect, useRef, useState } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { ConnectButton } from "./components/ConnectButton";
import { Landing } from "./components/Landing";
import { Onboarding } from "./components/Onboarding";
import { ProjectHome } from "./components/ProjectHome";
import { TablesView } from "./components/TablesView";
import { StorageView } from "./components/StorageView";
import { SqlEditor } from "./components/SqlEditor";
import { ServiceKeysView } from "./components/ServiceKeysView";
import { Docs } from "./components/Docs";
import { SettingsView } from "./components/SettingsView";
import { useSession } from "./lib/session";
import { useProjectMe } from "./lib/project";

type View = "home" | "tables" | "sql" | "storage" | "keys" | "settings";

export function App() {
  // Docs route — public, no auth needed
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/docs")) {
    return <Docs />;
  }

  const { ready, authenticated } = usePrivy();
  const { session, sign, busy: sessionBusy, error: sessionError, address } = useSession();
  const { data: project, isLoading: projLoading, refetch: refetchProject } = useProjectMe();

  const [view, setView] = useState<View>("home");

  // Auto-sign Mneme session exactly once when Privy is fully ready + address is in.
  // Use a ref so re-renders (from session/loading state churn) don't re-trigger.
  const autoSigned = useRef(false);
  useEffect(() => {
    if (!authenticated) { autoSigned.current = false; return; }
    if (autoSigned.current) return;
    if (!ready || !address || session || sessionBusy) return;
    autoSigned.current = true;
    void sign();
  }, [ready, authenticated, address, session, sessionBusy, sign]);

  // ─── 1. Privy still booting ────────────────────────────────────────────────
  if (!ready) return <FullScreen msg="Loading Mneme…" />;

  // ─── 2. Not logged in → marketing landing ──────────────────────────────────
  if (!authenticated) return <Landing />;

  // ─── 3. Logged in, embedded wallet still spinning up ───────────────────────
  if (!address) return <FullScreen msg="Preparing your wallet…" />;

  // ─── 4. Have wallet, no session yet — auto-sign in flight ─────────────────
  if (!session) {
    return (
      <FullScreen
        msg={
          sessionError
            ? `Couldn't open a session: ${sessionError}`
            : "Opening your session…"
        }
        actionLabel={sessionError ? "Retry" : undefined}
        onAction={sessionError ? () => { autoSigned.current = false; void sign(); } : undefined}
      />
    );
  }

  // ─── 5. Session present, project lookup running ───────────────────────────
  if (projLoading) return <FullScreen msg="Loading your project…" />;

  // ─── 6. Session present, no project → onboarding ──────────────────────────
  if (!project) return <Onboarding onCreated={() => refetchProject()} />;

  // ─── 7. Full app shell ─────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-ink-950 text-white font-sans antialiased">
      <header className="flex items-center justify-between px-6 py-4 border-b border-ink-900">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="font-semibold tracking-tight">Mneme</span>
          <span className="text-ink-500 text-sm">·</span>
          <span className="font-mono text-sm text-ink-300">{project.handle}.mneme</span>
        </div>
        <ConnectButton />
      </header>

      <div className="flex flex-1 min-h-0">
        <nav className="w-48 border-r border-ink-900 p-3 flex flex-col gap-1">
          <NavItem active={view === "home"}     onClick={() => setView("home")}     label="Home" />
          <NavItem active={view === "tables"}   onClick={() => setView("tables")}   label="Tables" />
          <NavItem active={view === "sql"}      onClick={() => setView("sql")}      label="SQL" />
          <NavItem active={view === "storage"}  onClick={() => setView("storage")}  label="Storage" />
          <NavItem active={view === "keys"}     onClick={() => setView("keys")}     label="API keys" />
          <NavItem active={view === "settings"} onClick={() => setView("settings")} label="Settings" />
          <a
            href="/docs"
            className="mt-2 text-left px-3 py-2 rounded-lg text-sm text-ink-500 hover:bg-ink-900 hover:text-white transition"
          >
            Docs ↗
          </a>
        </nav>
        <main className="flex-1 overflow-auto">
          {view === "home"     && <ProjectHome project={project} />}
          {view === "tables"   && <TablesView />}
          {view === "sql"      && <SqlEditor />}
          {view === "storage"  && <StorageView />}
          {view === "keys"     && <ServiceKeysView />}
          {view === "settings" && <SettingsView project={project} />}
        </main>
      </div>
    </div>
  );
}

function NavItem({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-left px-3 py-2 rounded-lg text-sm transition ${
        active ? "bg-ink-800 text-white" : "text-ink-400 hover:bg-ink-900 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function FullScreen({
  msg,
  actionLabel,
  onAction,
}: {
  msg:          string;
  actionLabel?: string;
  onAction?:    () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-ink-950 text-ink-400 text-sm">
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <Logo size={36} />
        <div className="w-8 h-8 rounded-full border-2 border-ink-700 border-t-gold-300 animate-spin" />
        <div className="max-w-sm">{msg}</div>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="mt-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-marble-100 transition"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function Logo({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/mnemelogo.png"
      alt="Mneme"
      style={{ height: size, width: "auto" }}
      className="object-contain"
    />
  );
}
