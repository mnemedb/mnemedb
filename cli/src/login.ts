import { createInterface } from "node:readline/promises";
import { Mneme } from "mneme-sdk";
import { saveConfig, DEFAULT_GATEWAY, configLocation, type MnemeConfig } from "./config";
import { gold, goldSoft, ink, inkDim, ok, err, marble, bold } from "./theme";

const KEY_RX = /^mneme_sk_[A-Za-z0-9_-]+$/;

export async function runLogin(): Promise<MnemeConfig> {
  console.log("");
  console.log(`  ${gold("✦")} ${bold(marble("First-time setup"))}`);
  console.log("");
  console.log(`  ${ink("1.")} Open ${goldSoft("mnemedb.dev")} in your browser`);
  console.log(`  ${ink("2.")} Sign in → ${goldSoft("API keys")} tab → ${goldSoft('Create new key')}`);
  console.log(`  ${ink("3.")} Use scope ${gold('"*"')} for a full-access CLI key`);
  console.log(`  ${ink("4.")} Copy the ${goldSoft("mneme_sk_…")} value (shown only once)`);
  console.log("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const apiKey = (await rl.question(`  ${gold("›")} paste API key: `)).trim();
  if (!KEY_RX.test(apiKey)) {
    rl.close();
    console.log("");
    console.log(`  ${err("✗")} that doesn't look like a valid mneme_sk_… key`);
    process.exit(1);
  }

  const gatewayInput = (await rl.question(`  ${gold("›")} gateway URL ${inkDim(`[${DEFAULT_GATEWAY}]`)}: `)).trim();
  rl.close();

  const gatewayUrl = gatewayInput || DEFAULT_GATEWAY;

  // Validate by hitting /v1/projects/me — works for both wallet + API-key auth
  const probe = new Mneme({ apiKey, gatewayUrl });
  let project: { handle: string; owner_wallet: string };
  try {
    project = await probe.request<{ handle: string; owner_wallet: string }>(
      "GET", "/v1/projects/me",
    );
  } catch (e) {
    console.log("");
    console.log(`  ${err("✗")} could not authenticate: ${(e as Error).message}`);
    console.log(`     ${inkDim("(make sure the key is active and the gateway URL is reachable)")}`);
    process.exit(1);
  }

  const cfg: MnemeConfig = {
    api_key:     apiKey,
    gateway_url: gatewayUrl,
    handle:      project.handle,
    wallet:      project.owner_wallet,
  };
  await saveConfig(cfg);

  console.log("");
  console.log(`  ${ok("✓")} logged in as ${gold(cfg.handle!)}${ink(".mneme")}`);
  console.log(`  ${inkDim("saved to")} ${inkDim(configLocation())}`);
  console.log("");

  return cfg;
}
