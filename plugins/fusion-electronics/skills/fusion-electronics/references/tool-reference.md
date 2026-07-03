# Tool Reference

This plugin forwards Autodesk Fusion's existing MCP tools and adds five Electronics-specific tools. Use the dedicated namespace `mcp__fusion_el` when available.

## Namespace And Discovery

Expected MCP server key:

```text
fusion_el
```

Expected model namespace:

```text
mcp__fusion_el
```

The `fusion_el` namespace is intentionally short so Codex can expose these explicit tool names without generated hash aliases. If a tool-discovery surface still displays shortened generated aliases for the local tools, the thread or installed plugin cache is stale. Refresh the install or start a fresh thread, then expect these names:

- "List native Fusion Electronics command definitions" means `fusion_mcp_electronics_list_commands`.
- "Start a native Fusion Electronics command by command ID" means `fusion_mcp_electronics_start_command`.
- "Execute a raw Fusion text command" means `fusion_mcp_electronics_text_command`.
- "Export the active Electronics schematic, board, library, or linked document" means `fusion_mcp_electronics_export_eagle`.
- "Run a Python snippet with Electronics helpers" means `fusion_mcp_electronics_run_python`.

## Forwarded Autodesk Tools

The augmented namespace should forward Autodesk's original tools unchanged. Common forwarded tools include:

- `fusion_mcp_read`
- `fusion_mcp_execute`
- `fusion_mcp_update`
- `fusion_mcp_electronics_read`

Use these for readback, screenshots, API documentation lookup, generic script execution, undo/redo, and Electronics entity reads.

## `fusion_mcp_electronics_list_commands`

Purpose: list native Fusion command definitions relevant to Electronics.

Use when:

- Discovering command IDs.
- Checking whether an Electronics command is applicable in the current active context.
- Performing the first safe smoke test after plugin install.

Input schema:

```json
{
  "filter": "optional string",
  "includeApplicability": true,
  "limit": 250
}
```

Rules:

- Keep `filter` narrow when searching for a specific command.
- Default `includeApplicability` to `true` unless the result is too noisy.
- `limit` defaults to `250` and is capped at `1000`.

Safe smoke:

```json
{
  "filter": "RunScript",
  "limit": 5
}
```

Expected healthy result for an Electronics context:

```text
Electron::RunScript
```

## `fusion_mcp_electronics_start_command`

Purpose: start a native Fusion Electronics command by command ID.

Use when:

- The command ID is known.
- The command exists and is applicable.
- The user asked to invoke an Electronics command or run a safe control smoke.

Input schema:

```json
{
  "commandId": "Electron::ZoomRedraw",
  "stopActiveCommand": true,
  "useTextCommand": true
}
```

Rules:

- Call `fusion_mcp_electronics_list_commands` first for unfamiliar command IDs.
- Keep `stopActiveCommand` true unless preserving the active command is intentional.
- Keep `useTextCommand` true unless testing `CommandDefinition.execute()` behavior specifically.
- Verify after command start, because many Fusion commands are interactive and may not produce a durable design change.

Known benign smoke command:

```text
Electron::ZoomRedraw
```

## `fusion_mcp_electronics_text_command`

Purpose: execute a raw `Application.executeTextCommand` string.

Use when:

- There is no safer explicit local tool.
- A specific Fusion text command is known and needed.
- The user understands the command can mutate the active design.

Input schema:

```json
{
  "command": "Commands.Start Electron::ZoomRedraw",
  "stopActiveCommand": true
}
```

Rules:

- Prefer `fusion_mcp_electronics_start_command` for command starts.
- Keep `stopActiveCommand` true unless the command requires the current modal state.
- Treat raw text commands as write-capable even when the string appears harmless.
- Verify with readback or user-visible state after use.

## `fusion_mcp_electronics_export_eagle`

Purpose: export a schematic, board, library, or linked Electronics document to EAGLE format through Fusion's `ElectronicsExportManager`.

Use when:

- The user asks for a `.sch`, `.brd`, or `.lbr` export.
- A smoke test needs to prove the plugin can perform a controlled write to disk.
- The active Electronics document or linked document is the desired export target.

Input schema:

```json
{
  "documentType": "auto",
  "outputPath": "/tmp/fusion-mcp-codex-smoke.sch"
}
```

Allowed `documentType` values:

- `auto`
- `schematic`
- `board`
- `library`
- `linkedBoard`
- `linkedSchematic`

Rules:

- `outputPath` must be absolute and end in `.sch`, `.brd`, or `.lbr`.
- Use `/tmp/...` for smoke tests.
- Match the extension to the intended export type:
  - `.sch` for schematic
  - `.brd` for board
  - `.lbr` for library
- Verify the file exists and has nonzero size after export.

Safe schematic smoke:

```json
{
  "documentType": "schematic",
  "outputPath": "/tmp/fusion-mcp-codex-smoke.sch"
}
```

## `fusion_mcp_electronics_run_python`

Purpose: run a Python snippet with Fusion app/UI/product bindings and optional design-change helpers.

Use when:

- The user asks for a controlled advanced probe.
- The explicit command/export tools are insufficient.
- The snippet is small, scoped, and verifiable.

Input schema:

```json
{
  "body": "print(product.objectType)",
  "args": {},
  "changeLabel": "MCP Electronics change"
}
```

Available locals in the snippet:

- `app`
- `ui`
- `product`
- `args`
- `begin_change(target=None, label=None)`
- `end_change(target=None)`
- `cancel_change(target=None)`

Rules:

- Keep snippets short.
- Do not catch exceptions unless the user specifically asks for custom error handling; raw exceptions are useful debugging evidence.
- For writes, use `begin_change`, `end_change`, and `cancel_change` where the target supports them.
- Always verify after running a snippet.
- Do not save the document unless explicitly instructed.

Read-only active-product probe:

```json
{
  "body": "print({'productType': product.objectType if product else None})"
}
```
