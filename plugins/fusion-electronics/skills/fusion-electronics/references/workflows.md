# Workflow Recipes

Use these workflows with the `mcp__fusion_el` namespace when it is available.

## Verify Plugin Availability

1. Check the MCP registry:

   ```bash
   codex mcp list
   ```

2. Confirm an enabled entry named:

   ```text
   fusion_el
   ```

3. In a fresh Codex context, use tool discovery and confirm the namespace:

   ```text
   mcp__fusion_el
   ```

4. If the namespace is missing but `codex mcp list` shows it enabled, reload or start a fresh Codex thread. Existing threads may not hot-load newly installed MCP servers.

## Safe Command Discovery Smoke

Use this to prove the augmented plugin can reach Fusion and execute a read-like script through `fusion_mcp_execute`.

1. Call `fusion_mcp_electronics_list_commands`:

   ```json
   {
     "filter": "RunScript",
     "limit": 5
   }
   ```

2. Treat the smoke as passing only if the result includes:

   ```text
   Electron::RunScript
   ```

3. Note `isApplicable` when returned. If it is false, Fusion is reachable but the active context may not support that command.

## Start A Safe Electronics Command

Use this for benign command-control validation.

1. Confirm the command exists:

   ```json
   {
     "filter": "ZoomRedraw",
     "limit": 10
   }
   ```

2. Start the known benign command:

   ```json
   {
     "commandId": "Electron::ZoomRedraw",
     "stopActiveCommand": true,
     "useTextCommand": true
   }
   ```

3. Passing result: Fusion returns a success response such as `Ok`.

4. If the command is not applicable, do not force it through a raw text command. Re-check active document type and Electronics workspace state.

## Discover And Start A User-Requested Command

1. Extract a likely command keyword from the user's request.

2. Call `fusion_mcp_electronics_list_commands` with that keyword:

   ```json
   {
     "filter": "Wire",
     "limit": 25
   }
   ```

3. Present or select a command ID only when the result clearly matches the user's request.

4. Prefer applicable commands. If all candidates have `isApplicable: false`, report that Fusion has the command but the active context does not permit it.

5. Start with `fusion_mcp_electronics_start_command`, not the raw text-command tool.

6. Verify with readback, screenshot, or user-visible state. Many Electronics commands enter interactive mode and require user input inside Fusion.

## Export Active Schematic As EAGLE

1. Choose an absolute path ending in `.sch`. For smoke tests, use `/tmp`:

   ```text
   /tmp/fusion-mcp-codex-smoke.sch
   ```

2. Call `fusion_mcp_electronics_export_eagle`:

   ```json
   {
     "documentType": "schematic",
     "outputPath": "/tmp/fusion-mcp-codex-smoke.sch"
   }
   ```

3. Verify with a filesystem check:

   ```bash
   ls -l /tmp/fusion-mcp-codex-smoke.sch
   ```

4. Treat the export as complete only when Fusion reports success and the file exists with nonzero size.

## Export Active Board Or Library

For board:

```json
{
  "documentType": "board",
  "outputPath": "/tmp/fusion-mcp-codex-smoke.brd"
}
```

For library:

```json
{
  "documentType": "library",
  "outputPath": "/tmp/fusion-mcp-codex-smoke.lbr"
}
```

If `documentType: "auto"` fails to resolve the intended target, retry with the explicit document type or linked target only after checking the active product state.

## Run A Read-Only Python Probe

Use `fusion_mcp_electronics_run_python` only when an explicit tool is insufficient.

Example:

```json
{
  "body": "print({'activeProduct': product.objectType if product else None})"
}
```

Rules:

- Keep the snippet small.
- Print a compact structured result.
- Do not use write helpers for read-only probes.

## Run A Controlled Python Write Probe

Use only when the user asks for an advanced write and the target object supports design-change helpers.

Pattern:

```json
{
  "changeLabel": "MCP Electronics probe",
  "args": {
    "expected": "small reversible change"
  },
  "body": "change = begin_change(label='MCP Electronics probe')\ntry:\n    print({'started': bool(change), 'args': args})\n    end_change()\nexcept Exception:\n    cancel_change()\n    raise"
}
```

Rules:

- Keep the probe reversible.
- Use `cancel_change()` on failure.
- Verify after the call.
- Do not save the document unless the user explicitly requested save.
