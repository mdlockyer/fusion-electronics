# Safety And Troubleshooting

## Risk Classes

Read-like actions:

- `fusion_mcp_electronics_list_commands`
- `fusion_mcp_read`
- `fusion_mcp_electronics_read`
- `resources/list`
- `resources/read`

Write/control actions:

- `fusion_mcp_electronics_start_command`
- `fusion_mcp_electronics_text_command`
- `fusion_mcp_electronics_export_eagle`
- `fusion_mcp_electronics_run_python`
- `fusion_mcp_execute` with scripts that mutate state
- `fusion_mcp_update`

Treat command starts as write/control even when they are intended to be benign, because Fusion commands can enter interactive state or affect the active document.

## Verification Rules

- Command discovery is verified by the returned command IDs and `isApplicable` fields.
- Command start is verified by Fusion output plus a readback or visible state check when possible.
- EAGLE export is verified by Fusion output plus filesystem existence and nonzero file size.
- Python probes are verified by printed structured output plus independent readback when they mutate state.
- Plugin install is verified by `codex plugin list --marketplace fusion-electronics`.
- MCP registration is verified by `codex mcp list`.
- Tool availability in a running thread is verified by tool discovery in that thread.

## Fresh Thread Requirement

Newly installed or updated Codex plugins may not hot-load into an already-running thread. If `codex mcp list` shows `fusion_el` enabled but tool discovery does not expose `mcp__fusion_el`, start or reload a Codex thread.

## Expected Install State

Marketplace name:

```text
fusion-electronics
```

Plugin selector:

```text
fusion-electronics@fusion-electronics
```

Expected cache root shape:

```text
~/.codex/plugins/cache/fusion-electronics/fusion-electronics/<version>/
```

Expected `.mcp.json` server key:

```text
fusion_el
```

Expected server command:

```text
node ./mcp/fusion-electronics-server.mjs
```

## If The Namespace Is Missing

1. Check marketplace install:

   ```bash
   codex plugin list --marketplace fusion-electronics
   ```

2. Check MCP registration:

   ```bash
   codex mcp list
   ```

3. Confirm the installed `.mcp.json` has server key `fusion_el`.

4. If install and MCP registration are correct, start a fresh Codex thread.

5. If still missing, check whether the plugin cache contains the expected files:

   ```text
   .codex-plugin/plugin.json
   .mcp.json
   mcp/fusion-electronics-server.mjs
   skills/fusion-electronics/SKILL.md
   ```

## If Fusion Is Unreachable

Symptoms:

- HTTP connection refused.
- Tool call timeout.
- `Fusion MCP request timed out`.
- `tools/list` cannot retrieve Autodesk tools.

Checks:

1. Confirm Fusion is running.
2. Confirm Fusion MCP Server is enabled in Fusion preferences.
3. Confirm the local endpoint is listening on port `27182` unless `PORT` is overridden.
4. Try a safe direct initialize smoke only if needed:

   ```bash
   curl -i -sS -X POST http://127.0.0.1:27182/mcp \
     -H 'Content-Type: application/json' \
     -H 'Accept: application/json, text/event-stream' \
     --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl-smoke","version":"0"}}}'
   ```

Healthy direct response includes HTTP 200 and an `MCP-Session-Id` header.

## If A Command Is Not Applicable

Do not force it through `fusion_mcp_electronics_text_command` by default. First check:

- Whether the active document is Electronics.
- Whether the active product is schematic, board, library, or another design type.
- Whether a modal command is already active.
- Whether `Electron::StopCommand` is applicable.

Then either choose an applicable command or report the context mismatch.

## If Export Fails

Check:

- `outputPath` is absolute.
- Extension matches `.sch`, `.brd`, or `.lbr`.
- `documentType` matches the active or linked target.
- The output directory is writable.
- Fusion returned a target type with an `exportManager`.

For smoke tests, prefer `/tmp/fusion-mcp-codex-smoke.sch`, `/tmp/fusion-mcp-codex-smoke.brd`, or `/tmp/fusion-mcp-codex-smoke.lbr`.

## If Python Probe Fails

Use the exception text as evidence. Do not hide it behind broad `try/except` handling unless the user asked for custom handling.

For write probes:

- Use `begin_change` only when the target supports it.
- Use `cancel_change` on failure.
- Keep the body short enough to inspect.
- Print compact structured output.

## Never Do These Without Explicit User Instruction

- Save a modified Fusion document.
- Close a document with unsaved changes.
- Run broad arbitrary Python over the active design.
- Use raw text commands when an explicit local tool can do the job.
- Export over an existing user file without confirming the path.
- Treat a successful HTTP response as proof of design-state success without readback.
