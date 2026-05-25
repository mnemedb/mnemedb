# $MNEME launch — Clawncher direct deploy

Free path (no CLAWNCH, no API key). Pay only gas. Token live + tradeable
the instant `deploy()` returns.

---

## Launch wallet

```
0x537EA37F84132756B9795AA712cf55DA3b1F7780
```

Currently empty. **Needs ETH on Base** before launch.

---

## What to send to the launch wallet

| Item | How much | Why |
|---|---|---|
| **ETH on Base** | 0.01-0.03 ETH (~$30-90) | Gas for factory deploy + pool init + MEV setup + LP mint. 0.01 ETH = safe minimum, 0.03 ETH = comfortable buffer. |

That's it. No CLAWNCH token needed (we're using direct deploy, not verified agent).

**How to get ETH on Base:**
- Bridge from Ethereum mainnet: https://bridge.base.org
- Direct withdrawal from Coinbase exchange (network = "Base")
- Buy on a Base CEX (Coinbase / Kraken) and withdraw

---

## Token metadata (locked)

```
name        : Mneme
symbol      : MNEME
image       : https://mnemedb.dev/mnemelogo.png   ← already live
description : The agent-native database platform on Base. Wallet-auth, runtime DDL, pgvector built-in.
website     : https://mnemedb.dev
github      : https://github.com/mnemedb/mnemedb
```

Fee split: 80% LP fees → deployer wallet (`Paired` = paid in WETH). 20% → protocol.

No vault. No devBuy. No verified-agent badge.

---

## Launch sequence (T-0 = 22:00 TRT)

```
T-30 min  send 0.01-0.03 ETH to 0x537EA37F84132756B9795AA712cf55DA3b1F7780
T-10 min  open PowerShell, set $env:LAUNCH_KEY
T-5  min  install SDK + dry-run
T-0       uncomment deploy() block in scripts/clawnch-deploy.ts, re-run
T+0       copy tokenAddress from console output
T+1 min   paste address into launch tweet, post
T+2 min   pin tweet, open dexscreener.com/base/<address> to confirm pool
```

### Commands

```powershell
# T-30 min: send ETH to launch wallet (do this via your funded wallet)

# T-10 min: open PowerShell at repo root
cd C:\Users\celik\Desktop\mneme
$env:LAUNCH_KEY = "0x<launch-wallet-private-key>"

# T-5 min: install SDK + dry-run
& "$env:USERPROFILE\.bun\bin\bun.exe" add @clawnch/clawncher-sdk
& "$env:USERPROFILE\.bun\bin\bun.exe" run scripts/clawnch-deploy.ts

# Expected output:
#   launch wallet: 0x537EA37F84132756B9795AA712cf55DA3b1F7780
#   params: { ... full params ... }
#   ETH on Base: 0.03 ETH
#   DRY RUN — no deploy executed.

# T-0: edit scripts/clawnch-deploy.ts → uncomment the /* ... */ block at the bottom
# Save, then re-run:
& "$env:USERPROFILE\.bun\bin\bun.exe" run scripts/clawnch-deploy.ts

# Expected output:
#   🏛️  $MNEME deployed
#     tokenAddress : 0x...
#     dexscreener  : https://dexscreener.com/base/0x...
```

---

## Launch tweet (paste, replace `0x<address>`)

```
$MNEME is live on @base.

The agent-native database — every project gets a real Postgres schema,
wallet auth, vector search built-in. Live since this morning at mnemedb.dev.

CA: 0x<address>

🏛️
```

---

## Post-launch (first 30 min)

- [ ] `dexscreener.com/base/0x<address>` renders, shows pool
- [ ] Try a small swap yourself (0.001 ETH → MNEME) to confirm trading
- [ ] Tweet posted + pinned
- [ ] Check `clawncher fees check 0x537EA37F84132756B9795AA712cf55DA3b1F7780 -t 0x<address>` returns 0 (no fees yet, but command works = setup OK)
