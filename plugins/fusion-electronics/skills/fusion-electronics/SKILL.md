---
name: fusion-electronics
description: This skill should be used when Codex needs to inspect or operate Autodesk Fusion Electronics through the Fusion Electronics MCP plugin, including command discovery, command execution, EAGLE export, safe smoke tests, or controlled Python probes.
version: 1.0.3
user-invocable: true
---

# Fusion Electronics

Operate Autodesk Fusion Electronics through the local Fusion MCP endpoint. Use the plugin's dedicated MCP namespace, preserve Autodesk's original Fusion MCP tools, and prefer small evidence-producing actions before write/control actions.

## Source Of Truth

- Treat the active Fusion session and active Fusion document as the controlling source of truth.
- Treat `codex mcp list` as the source of truth for whether the plugin is installed and enabled.
- Treat `tools/list` or tool discovery as the source of truth for the exact tool names exposed in the current Codex context.
- Do not assume the active document is a schematic, board, or library. Read or resolve it before exporting or mutating.

## Namespace

Primary MCP namespace:

```text
mcp__fusion_el
```

The original Autodesk Fusion endpoint may also appear as:

```text
mcp__fusion_360
```

Use `mcp__fusion_el` for Electronics automation work because it forwards Autodesk's tools and adds the local Electronics tools. The namespace is intentionally short so Codex can expose the explicit local tool names without hashed aliases. Use the existing `fusion_360` namespace only when the user explicitly asks for the stock Fusion endpoint or the augmented namespace is unavailable.

If tool discovery still shows generated hash aliases for the Electronics tools, treat that as evidence of a stale plugin cache or stale thread context. Confirm that `codex mcp list` shows server key `fusion_el`, then start a fresh Codex thread.

## Operating Rules

1. Start with discovery or readback. Use `tools/list`, `fusion_mcp_electronics_list_commands`, `fusion_mcp_electronics_read`, or `fusion_mcp_read` before choosing a write/control action.
2. Prefer explicit tools over escape hatches:
   - Use `fusion_mcp_electronics_list_commands` before unfamiliar command IDs.
   - Use `fusion_mcp_electronics_start_command` for known Fusion command IDs.
   - Use `fusion_mcp_electronics_export_eagle` for `.sch`, `.brd`, and `.lbr` export.
   - Use `fusion_mcp_electronics_text_command` only when a raw Fusion text command is necessary.
   - Use `fusion_mcp_electronics_run_python` only for small controlled probes or writes.
3. Verify every write/control action. Use read tools, command output, file existence checks, or a screenshot/readback as appropriate.
4. Keep mutating probes reversible. Prefer temporary export paths under `/tmp` and benign commands such as `Electron::ZoomRedraw`.
5. Do not save or close a modified Fusion document unless the user explicitly instructs it and confirms the choice.

## Standard Workflow

1. Confirm that Fusion is running and the plugin server is available if needed:

   ```bash
   codex mcp list
   ```

   The expected enabled server is `fusion_el`.

2. Discover available tools in the current context. Confirm that `mcp__fusion_el` is present before using Electronics automation tools.

3. For Electronics command work, call `fusion_mcp_electronics_list_commands` with a narrow `filter` before starting a command.

4. For export work, resolve whether the active product is a schematic, board, library, or linked document, then export to a specific absolute path.

5. After any tool call that can mutate state, verify the result with an independent signal: command output, readback, exported file metadata, or user-visible state.

Use [Workflow Recipes](references/workflows.md) for common tasks and [Safety And Troubleshooting](references/safety-and-troubleshooting.md) when a command can mutate state, the tool namespace is missing, or Fusion returns ambiguous output.

## Fast Smoke

Use this first when validating the plugin against a live Fusion session:

```json
{
  "filter": "RunScript",
  "limit": 5
}
```

Call it with `fusion_mcp_electronics_list_commands`. A healthy Electronics session should return `Electron::RunScript` when Electronics commands are available in the active context.

## References

- [Tool Reference](references/tool-reference.md) - Exact tool purposes, inputs, and safe example calls.
- [Workflow Recipes](references/workflows.md) - Step-by-step procedures for discovery, command start, EAGLE export, and Python probes.
- [Safety And Troubleshooting](references/safety-and-troubleshooting.md) - Risk rules, verification rules, install checks, and failure handling.
