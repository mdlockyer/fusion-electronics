# Fusion Electronics

Fusion Electronics is a Codex plugin for Autodesk Fusion Electronics. It adds Codex tools for inspecting the active Electronics document, running Electronics commands, exporting EAGLE files, and making controlled changes through Fusion's local MCP server.

The plugin forwards Autodesk's standard Fusion MCP tools and adds Electronics-specific tools for schematic, board, and library workflows.

## Requirements

- Autodesk Fusion installed and running locally.
- Fusion MCP Server enabled in Fusion preferences.
- Codex with plugin support.
- Node.js 20 or newer.

Fusion's local MCP endpoint must be available at:

```text
http://127.0.0.1:27182/mcp
```

## Install

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

## Tools

Fusion Electronics adds these tools:

- `fusion_mcp_electronics_list_commands`
- `fusion_mcp_electronics_start_command`
- `fusion_mcp_electronics_text_command`
- `fusion_mcp_electronics_export_eagle`
- `fusion_mcp_electronics_run_python`

Autodesk's existing Fusion MCP tools are forwarded through the same plugin server.

## Safety

The plugin operates on the active Fusion document. Some tools can modify unsaved schematic, board, or library content. Check the active document before running write tools, start with command discovery or readback, and save only when you intend to keep the changes.

## Troubleshooting

If the plugin does not appear after installation, confirm that Codex can read the marketplace:

```bash
codex plugin list --marketplace fusion-electronics
```

If the MCP namespace is missing after installation, reload Codex and check the MCP registry:

```bash
codex mcp list
```

The expected MCP server key is `fusion_el`.

## Development

For local development, register the checkout path instead of the GitHub repo:

```bash
codex plugin marketplace add /path/to/fusion-electronics
```

Run the syntax check:

```bash
npm run check
```

The plugin server is dependency-free Node ESM, so validation does not require an install step.

Repository layout:

```text
.agents/plugins/marketplace.json            # Codex marketplace manifest
plugins/fusion-electronics/.codex-plugin/   # Plugin manifest
plugins/fusion-electronics/.mcp.json         # MCP server registration
plugins/fusion-electronics/mcp/              # Node stdio MCP server
plugins/fusion-electronics/skills/           # Codex skill and references
```

## License

MIT
