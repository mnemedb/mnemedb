import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";

export interface MnemeConfig {
  api_key:     string;
  gateway_url: string;
  handle?:     string;        // cached after first /v1/projects/me call
  wallet?:     string;
}

const CONFIG_DIR  = process.platform === "win32"
  ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "mneme")
  : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "mneme");

const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export const DEFAULT_GATEWAY = "https://gateway.mnemedb.dev";

export async function loadConfig(): Promise<MnemeConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as MnemeConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(cfg: MnemeConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
  // Lock down on POSIX — only the user can read the API key.
  if (process.platform !== "win32") {
    try { await chmod(CONFIG_PATH, 0o600); } catch { /* best-effort */ }
  }
}

export function configLocation(): string {
  return CONFIG_PATH;
}
