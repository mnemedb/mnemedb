import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "./components/ConnectButton";
import { Landing } from "./components/Landing";
import { SignInGate } from "./components/SignInGate";
import { Onboarding } from "./components/Onboarding";
import { ProjectHome } from "./components/ProjectHome";
import { TablesView } from "./components/TablesView";
import { SettingsView } from "./components/SettingsView";
import { useSession } from "./lib/session";
import { useProjectMe } from "./lib/project";

type View = "home" | "tables" | "settings";
type Intent = "signin" | "create" | null;

export function App() {
  const { isConnected } = useAccount();
  const { session } = useSession();
  const { data: project, isLoading: projLoading, refetch: refetchProject } = useProjectMe();

  const [view, setView]     = useState<View>("home");
  const [intent, setIntent] = useState<Intent>(null);

  // ───── 1. Not connected → marketing landing ────────────────────────────────
  if (!isConnected) return <Landing />;

  // ───── 2. Connected, but no session yet ────────────────────────────────────
  if (!session) {
    if (intent === "create") {
      // Single signature: create project + receive session.
      return (
        <Onboarding
          onCreated={() => {
            setIntent(null);
            refetchProject();
          }}
        />
      );
    }
    // Default: ask user what they want.
    return (
      <SignInGate
        onSignedIn={() => setIntent("signin")}
        onCreateNew={() => setIntent("create")}
      />
    );
  }

  // ───── 3. Session present, project lookup running ─────────────────────────
  if (projLoading) return <FullScreen msg="Loading your project…" />;

  // ───── 4. Session present, but no project for this wallet → onboarding ────
  if (!project) {
    return <Onboarding onCreated={() => refetchProject()} />;
  }

  // ───── 5. Full app shell ──────────────────────────────────────────────────
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
    <div className="flex items-center justify-center min-h-screen bg-ink-950 text-ink-500 text-sm">
      {msg}
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
