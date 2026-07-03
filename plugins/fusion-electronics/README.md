# Fusion Electronics Codex Plugin

This Codex plugin connects to Autodesk Fusion's local MCP endpoint and forwards Autodesk's existing tools unchanged while adding explicit Fusion Electronics automation tools.

Default Fusion endpoint:

```text
http://127.0.0.1:27182/mcp
```

The server is dependency-free Node ESM.

## Marketplace Install

This workspace is a local marketplace source through:

```text
.agents/plugins/marketplace.json
```

Register and install it with:

```bash
codex plugin marketplace add /path/to/fusion-electronics
codex plugin add fusion-electronics@fusion-electronics
```

The MCP server key is `fusion_el`. It is intentionally short: with Codex's MCP namespace prefix, the explicit tool names remain short enough to avoid hashed/generated aliases while still avoiding collision with the stock `fusion_360` server.

## Tools

- `fusion_mcp_electronics_list_commands`
- `fusion_mcp_electronics_start_command`
- `fusion_mcp_electronics_text_command`
- `fusion_mcp_electronics_export_eagle`
- `fusion_mcp_electronics_run_python`

Autodesk's original Fusion MCP tools are requested from the live Fusion endpoint and returned alongside these local augmentation tools.

## Validation

Run a syntax check:

```bash
node --check plugins/fusion-electronics/mcp/fusion-electronics-server.mjs
```

Start a disposable stdio process:

```bash
node plugins/fusion-electronics/mcp/fusion-electronics-server.mjs
```

Send initialize:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
```

Then send `tools/list` and confirm that Autodesk Fusion tools and the five Electronics tools appear.

Useful live smoke calls:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fusion_mcp_electronics_list_commands","arguments":{"filter":"RunScript","limit":5}}}
```

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"fusion_mcp_electronics_start_command","arguments":{"commandId":"Electron::ZoomRedraw"}}}
```

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"fusion_mcp_electronics_export_eagle","arguments":{"documentType":"schematic","outputPath":"/tmp/fusion-mcp-codex-smoke.sch"}}}
```

Install into Codex only after the standalone stdio smoke passes against a live Fusion session.
