# @mneme/mcp

MCP (Model Context Protocol) server for Mneme. Plug it into **Claude Desktop**,
**Cursor**, **Cline**, **Continue**, or any MCP-compatible client and your
agent gains four tools backed by its own wallet identity:

| Tool                  | What it does                                       |
|-----------------------|----------------------------------------------------|
| `mneme_list_tables`   | List the built-in tables                           |
| `mneme_insert`        | Insert row(s) into `memories`/`documents`/`events`/`kvs` |
| `mneme_list`          | List most recent rows                              |
| `mneme_vector_search` | KNN search over `memories.embedding` or `documents.embedding` |

## Install

```bash
bun add -g @mneme/mcp
# or
npm i -g @mneme/mcp
```

## Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (mac) or
`%APPDATA%\Claude\claude_desktop_config.json` (windows):

```json
{
  "mcpServers": {
    "mneme": {
      "command": "mneme-mcp",
      "env": {
        "MNEME_AGENT_PRIVATE_KEY": "0x...",
        "MNEME_GATEWAY_URL": "https://gateway.mnemedb.dev"
      }
    }
  }
}
```

## Cursor / Cline / Continue

Same shape — drop the same JSON block into the client's MCP config.

## Security

The MCP server holds the agent's **private key** in env. Treat it like any
wallet secret. For team/shared agents, rotate per-environment and never commit.
