# Fusion Electronics

Codex plugin for Autodesk Fusion Electronics.

Fusion Electronics connects Codex to Autodesk Fusion's local MCP server, forwards Autodesk's standard Fusion MCP tools, and adds Electronics-specific tools for command discovery, command execution, EAGLE export, and controlled Python probes.

## What It Adds

- Lists native Fusion Electronics commands and their applicability in the active context.
- Starts known Electronics commands by command ID.
- Runs raw Fusion text commands when no safer structured tool exists.
- Exports active schematics, boards, libraries, or linked Electronics documents to EAGLE `.sch`, `.brd`, and `.lbr` files.
- Runs small Python snippets with Fusion app/UI/product bindings for advanced inspection or controlled writes.

## Requirements

- Autodesk Fusion installed and running locally.
- Fusion MCP Server enabled in Fusion preferences.
- Codex with local plugin support.
- Node.js 20 or newer for the plugin server.

The plugin connects to Fusion's local MCP endpoint at:

```text
http://127.0.0.1:27182/mcp
```

## Install From GitHub

Register this repository as a Codex marketplace:

```bash
codex plugin marketplace add mdlockyer/fusion-electronics
```

Install the plugin:

```bash
codex plugin add fusion-electronics@fusion-electronics
```

For a specific branch or tag:

```bash
codex plugin marketplace add mdlockyer/fusion-electronics --ref main
```

For local development, register the checkout path instead:

```bash
codex plugin marketplace add /path/to/fusion-electronics
```

After reloading Codex, the MCP namespace should be:

```text
mcp__fusion_el
```

## Tools

The plugin adds these Fusion Electronics tools:

- `fusion_mcp_electronics_list_commands`
- `fusion_mcp_electronics_start_command`
- `fusion_mcp_electronics_text_command`
- `fusion_mcp_electronics_export_eagle`
- `fusion_mcp_electronics_run_python`

Autodesk's existing Fusion MCP tools are forwarded through the same plugin server.

## Repository Layout

```text
.agents/plugins/marketplace.json            # Repo-local Codex marketplace
plugins/fusion-electronics/.codex-plugin/   # Codex plugin manifest
plugins/fusion-electronics/.mcp.json         # MCP server registration
plugins/fusion-electronics/mcp/              # Node stdio MCP server
plugins/fusion-electronics/skills/           # Codex skill and references
```

## Validate

Run the server syntax check:

```bash
npm run check
```

Validate the plugin package directly:

```bash
npm --prefix plugins/fusion-electronics run check
```

The plugin is dependency-free Node ESM, so no install step is required for validation.

Confirm Codex can read the marketplace:

```bash
codex plugin list --marketplace fusion-electronics
```

## Safety

Treat the active Fusion session as the source of truth. Start with readback or command discovery, verify every write/control action, and do not save or close modified Fusion documents unless the user explicitly asks for it.

## License

MIT
