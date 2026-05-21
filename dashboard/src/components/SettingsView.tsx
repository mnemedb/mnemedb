import { useAccount } from "wagmi";
import type { ProjectInfo } from "../lib/project";

interface Props {
  project: ProjectInfo;
}

export function SettingsView({ project }: Props) {
  const { address } = useAccount();

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="text-ink-500 text-xs uppercase tracking-wider">settings</div>
        <h1 className="text-3xl font-semibold font-mono mt-1">{project.handle}.mneme</h1>
      </div>

      <Section title="Wallet">
        <div className="text-sm font-mono text-ink-400 break-all">{address}</div>
      </Section>

      <Section title="Project">
        <div className="space-y-1 text-sm">
          <Row label="handle"      value={project.handle} />
          <Row label="schema"      value={project.schema_name} />
          <Row label="owner"       value={project.owner} />
        </div>
      </Section>

      <Section title="Transfer ownership">
        <p className="text-sm text-ink-500">
          Coming soon. Will let you move a project to another wallet via a signed message.
        </p>
      </Section>

      <Section title="Delete project">
        <p className="text-sm text-ink-500">
          Coming soon. Will drop the schema and all its data — irreversible.
        </p>
      </Section>

      <Section title="$MNEME">
        <p className="text-sm text-ink-500">
          Balance &amp; top-up — coming with token launch.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
      <h2 className="text-sm font-medium text-ink-200 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-ink-500 text-xs uppercase tracking-wider w-16 shrink-0">{label}</span>
      <span className="font-mono text-ink-300 break-all">{value}</span>
    </div>
  );
}
