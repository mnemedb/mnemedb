import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { ConnectButton } from "./components/ConnectButton";
import { Landing } from "./components/Landing";
import { Onboarding } from "./components/Onboarding";
import { ProjectHome } from "./components/ProjectHome";
import { TablesView } from "./components/TablesView";
import { SettingsView } from "./components/SettingsView";
import { useSession } from "./lib/session";
import { useProjectMe } from "./lib/project";

type View = "home" | "tables" | "settings";

export function App() {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();
  const { session, sign, busy: sessionBusy, error: sessionError } = useSession();
  const { data: project, isLoading: projLoading, refetch: refetchProject } = useProjectMe();

  const [view, setView] = useState<View>("home");

  // ─── Auto-sign Mneme session as soon as Privy is ready + wallet is in ───
  // Privy embedded wallets sign silently (no popup), so this is invisible to
  // the user. External wallets (MetaMask) will show their standard popup.
  useEffect(() => {
    if (ready && authenticated && address && !session && !sessionBusy) {
      void sign();
    }
  }, [ready, authenticated, address, session, sessionBusy, sign]);

  // ─── 1. Privy still booting ────────────────────────────────────────────────
  if (!ready) return <FullScreen msg="Loading…" />;

  // ─── 2. Not logged in → marketing landing ──────────────────────────────────
  if (!authenticated) return <Landing />;

  // ─── 3. Logged in, waiting for embedded wallet to be ready ─────────────────
  if (!address) return <FullScreen msg="Preparing your wallet…" />;

  // ─── 4. Have wallet, no session yet — auto-sign is running ─────────────────
  if (!session) {
    return (
      <FullScreen
        msg={
          sessionError
            ? `Couldn't open a session: ${sessionError}`
            : sessionBusy
              ? "Opening your session…"
              : "Preparing your session…"
        }
      />
    );
  }

  // ─── 5. Session present, project lookup running ───────────────────────────
  if (projLoading) return <FullScreen msg="Loading your project…" />;

  // ─── 6. Session present, no project → onboarding ──────────────────────────
  if (!project) {
    return <Onboarding onCreated={() => refetchProject()} />;
  }

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
          <NavItem active={view === "settings"} onClick={() => setView("settings")} label="Settings" />
        </nav>
        <main className="flex-1 overflow-auto">
          {view === "home"     && <ProjectHome project={project} />}
          {view === "tables"   && <TablesView />}
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

function FullScreen({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-ink-950 text-ink-400 text-sm">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-ink-700 border-t-gold-300 animate-spin" />
        <div>{msg}</div>
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
