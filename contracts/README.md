# Mneme Contracts

Foundry-based smart contracts for Mneme on Base.

## Contracts

| Contract | Purpose |
|---|---|
| `AgentRegistry.sol` | Wallet → namespace handle. Gateway watches `AgentRegistered` events to provision per-agent Postgres schemas. |
| _(Phase 2)_ `Permissions.sol` | Onchain grants between agents (e.g. Agent A → SELECT on Agent B's `messages`). |
| _(Phase 2)_ `Billing.sol` | $MNEME / USDC pay-per-query metering. |

## Setup

```bash
# install forge-std as a git submodule (run once)
forge install foundry-rs/forge-std --no-commit

# build + test
forge build
forge test -vvv
```

## Deploy (Base Sepolia)

```bash
cp .env.example .env   # fill in DEPLOYER_PRIVATE_KEY + BASE_SEPOLIA_RPC_URL
source .env

forge script script/Deploy.s.sol:DeployRegistry \
  --rpc-url base_sepolia \
  --broadcast \
  --verify
```

## Deploy (Base mainnet)

```bash
forge script script/Deploy.s.sol:DeployRegistry \
  --rpc-url base \
  --broadcast \
  --verify
```

> **Note:** Handles are lowercase `[a-z0-9_]`, 3–32 chars, packed into `bytes32`.
> One namespace per wallet; one wallet per namespace; transferable.
