# mneme-cli

Terminal client for [Mneme](https://mnemedb.dev) — the agent-native database on Base.

Talk to your schema in plain English. The CLI uses the gateway's LLM proxy
to translate your prompts into SQL, runs them against your schema, and
renders the results as a proper terminal table.

```
$ mneme

 ███╗   ███╗ ███╗   ██╗ ███████╗ ███╗   ███╗ ███████╗
 ████╗ ████║ ████╗  ██║ ██╔════╝ ████╗ ████║ ██╔════╝
 ██╔████╔██║ ██╔██╗ ██║ █████╗   ██╔████╔██║ █████╗
 ██║╚██╔╝██║ ██║╚██╗██║ ██╔══╝   ██║╚██╔╝██║ ██╔══╝
 ██║ ╚═╝ ██║ ██║ ╚████║ ███████╗ ██║ ╚═╝ ██║ ███████╗
 ╚═╝     ╚═╝ ╚═╝  ╚═══╝ ╚══════╝ ╚═╝     ╚═╝ ╚══════╝

  memory you can hold in your terminal

✦ mneme · agentdemo.mneme
› show me my 5 most recent memories

────────────────────────────────────────────────────────────
  SELECT id, text, created_at FROM memories ORDER BY created_at DESC LIMIT 5
────────────────────────────────────────────────────────────
┌────┬──────────────────────────────────────────────┬─────────────────────┐
│ id │ text                                         │ created_at          │
├────┼──────────────────────────────────────────────┼─────────────────────┤
│ 42 │ shipped the storage subsystem today          │ 2026-05-25 14:01:33 │
│ 41 │ Mneme is the goddess of memory               │ 2026-05-24 09:12:08 │
│ ...│ ...                                          │ ...                 │
└────┴──────────────────────────────────────────────┴─────────────────────┘
✓ 5 rows · 18ms query · 412ms llm
```

## Install

```bash
bun add -g mneme-cli      # or npm install -g mneme-cli
```

## First-time setup

1. Sign in at [mnemedb.dev](https://mnemedb.dev)
2. Open **API keys** → **Create new key** → scope `*` for full access
3. Copy the `mneme_sk_…` value (shown only once)
4. Run `mneme` and paste the key when asked

The key is saved to `~/.config/mneme/config.json` (file mode `600` on POSIX).

## Commands inside the REPL

| Command          | What it does                                            |
| ---------------- | ------------------------------------------------------- |
| anything else    | natural language → SQL → executed                        |
| `/tables`        | list every table in your schema                          |
| `/schema <name>` | show columns + types of a single table                   |
| `/sql <query>`   | skip the LLM and run raw SQL directly                    |
| `/quota`         | current storage quota + bonus expiry                     |
| `/whoami`        | show your handle, wallet, gateway                        |
| `/clear`         | clear the terminal                                       |
| `/help`          | show this list                                           |
| `/exit`          | quit (also Ctrl+D)                                       |

## Examples

```
› count memories grouped by month
› show me the 10 most popular authors in books
› create a table called todos with title (text) and done (bool)
› insert a todo: title="ship mneme cli", done=false
› what's the schema of the events table?
› find books rated 5 stars by Frank Herbert
› vector search the memories table for "agent-native database"
```

## Privacy

- The LLM (Claude Sonnet 4.5 via fal.ai) runs on Mneme's gateway, not in
  the CLI. Your API key never leaves your machine.
- Prompts and generated SQL are not logged on our side beyond basic
  rate-limit accounting.
- The CLI never writes your data anywhere except your schema on Mneme.

## License

MIT
