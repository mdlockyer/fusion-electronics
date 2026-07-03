#!/usr/bin/env node

/**
 * Codex MCP server for Fusion Electronics.
 *
 * The server speaks JSON-RPC over stdio to Codex and direct JSON-RPC over HTTP
 * to Autodesk Fusion's local MCP endpoint. It forwards Fusion's tools and adds
 * Electronics-specific write and command helpers implemented through Fusion's
 * existing fusion_mcp_execute tool.
 */

import process from "node:process";

const SERVER_NAME = "fusion-electronics";
const SERVER_VERSION = "1.0.3";
const DEFAULT_PORT = 27182;
const DEFAULT_HTTP_TIMEOUT_MS = 30000;
const PROTOCOL_VERSION = "2025-06-18";

const envPort = process.env.PORT;
const parsedPort = Number.parseInt(envPort ?? "", 10);
const port = Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : DEFAULT_PORT;
const fusionUrl = `http://127.0.0.1:${port}/mcp`;
const parsedTimeout = Number.parseInt(process.env.FUSION_MCP_TIMEOUT_MS ?? "", 10);
const httpTimeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_HTTP_TIMEOUT_MS;

let inputBuffer = "";
let nextFusionRequestId = 1;
let fusionSessionId;
let fusionInitialized = false;
let fusionInitializePromise;
let remoteToolsCache;

const localToolNames = new Set();

function log(...args) {
	process.stderr.write(`[fusion-electronics] ${args.join(" ")}\n`);
}

function writeMessage(message) {
	process.stdout.write(`${JSON.stringify(message)}\n`);
}

function textResult(text, extra = {}) {
	return {
		content: [{ type: "text", text: typeof text === "string" ? text : JSON.stringify(text, null, 2) }],
		...extra,
	};
}

function errorResult(message, extra = {}) {
	return textResult(message, { isError: true, ...extra });
}

function requireString(value, name) {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`${name} must be a non-empty string`);
	}
	return value;
}

function requireBoolean(value, name, defaultValue) {
	if (value === undefined) {
		return defaultValue;
	}
	if (typeof value !== "boolean") {
		throw new Error(`${name} must be a boolean`);
	}
	return value;
}

function limitNumber(value, defaultValue, maximum) {
	const numberValue = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(numberValue)) {
		return defaultValue;
	}
	return Math.max(1, Math.min(maximum, Math.floor(numberValue)));
}

function escapePythonString(value) {
	return JSON.stringify(String(value));
}

function escapePythonJson(value) {
	return JSON.stringify(JSON.stringify(value ?? {}));
}

class JsonRpcError extends Error {
	constructor(error) {
		const message = error && typeof error.message === "string" ? error.message : JSON.stringify(error);
		super(message);
		this.name = "JsonRpcError";
		this.code = error?.code;
		this.data = error?.data;
	}
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

function parseSseMessages(text) {
	const messages = [];
	let dataLines = [];

	function flush() {
		if (dataLines.length === 0) {
			return;
		}
		const payload = dataLines.join("\n").trim();
		dataLines = [];
		if (!payload || payload === "[DONE]") {
			return;
		}
		messages.push(JSON.parse(payload));
	}

	for (const line of text.split(/\r?\n/)) {
		if (line === "") {
			flush();
			continue;
		}
		if (line.startsWith("data:")) {
			dataLines.push(line.slice(5).replace(/^ /, ""));
		}
	}
	flush();

	return messages;
}

function parseJsonRpcMessages(text, contentType) {
	const trimmed = text.trim();
	if (!trimmed) {
		return [];
	}
	if (contentType.includes("text/event-stream") || trimmed.startsWith("data:") || trimmed.startsWith("event:")) {
		return parseSseMessages(text);
	}
	const parsed = JSON.parse(trimmed);
	return Array.isArray(parsed) ? parsed : [parsed];
}

async function postFusion(payload, expectedId) {
	const headers = {
		"Content-Type": "application/json",
		Accept: "application/json, text/event-stream",
	};
	if (fusionSessionId) {
		headers["MCP-Session-Id"] = fusionSessionId;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), httpTimeoutMs);
	let response;
	try {
		response = await fetch(fusionUrl, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
			signal: controller.signal,
		});
	} catch (error) {
		if (error?.name === "AbortError") {
			throw new Error(`Fusion MCP request timed out after ${httpTimeoutMs}ms`);
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}

	const sessionHeader = response.headers.get("MCP-Session-Id");
	if (sessionHeader) {
		fusionSessionId = sessionHeader;
	}

	const body = await response.text();
	if (!response.ok) {
		const snippet = body.length > 1200 ? `${body.slice(0, 1200)}...` : body;
		throw new Error(`Fusion MCP HTTP ${response.status} ${response.statusText}${snippet ? `: ${snippet}` : ""}`);
	}

	const contentType = response.headers.get("Content-Type") ?? "";
	const messages = parseJsonRpcMessages(body, contentType);
	if (expectedId === undefined) {
		return undefined;
	}

	const message =
		messages.find((item) => item && Object.prototype.hasOwnProperty.call(item, "id") && item.id === expectedId) ??
		messages.find((item) => item && (Object.prototype.hasOwnProperty.call(item, "result") || Object.prototype.hasOwnProperty.call(item, "error"))) ??
		messages[0];

	if (!message) {
		throw new Error("Fusion MCP returned no JSON-RPC response");
	}
	if (message.error) {
		throw new JsonRpcError(message.error);
	}
	return message.result ?? {};
}

async function sendFusionRequest(method, params = {}) {
	const id = nextFusionRequestId++;
	return postFusion({ jsonrpc: "2.0", id, method, params }, id);
}

async function sendFusionNotification(method, params = {}) {
	await postFusion({ jsonrpc: "2.0", method, params }, undefined);
}

async function ensureFusionInitialized() {
	if (fusionInitialized) {
		return;
	}
	if (!fusionInitializePromise) {
		fusionInitializePromise = (async () => {
			await sendFusionRequest("initialize", {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: {},
				clientInfo: { name: SERVER_NAME, version: SERVER_VERSION },
			});
			fusionInitialized = true;
			try {
				await sendFusionNotification("notifications/initialized", {});
			} catch (error) {
				log(`remote initialized notification failed: ${errorMessage(error)}`);
			}
		})();
	}

	try {
		await fusionInitializePromise;
	} catch (error) {
		fusionInitializePromise = undefined;
		throw error;
	}
}

async function callFusion(method, params = {}) {
	await ensureFusionInitialized();
	return sendFusionRequest(method, params);
}

async function callRemoteTool(name, args) {
	return callFusion("tools/call", { name, arguments: args ?? {} });
}

async function runFusionScript(script) {
	return callRemoteTool("fusion_mcp_execute", {
		featureType: "script",
		object: { script },
	});
}

function commandPrelude(stopActiveCommand) {
	return `
    ui = app.userInterface
    if ${stopActiveCommand ? "True" : "False"}:
        stop_cmd = ui.commandDefinitions.itemById("Electron::StopCommand")
        if stop_cmd and stop_cmd.isApplicable:
            stop_cmd.execute()
`;
}

const localTools = [
	{
		name: "fusion_mcp_electronics_list_commands",
		description:
			"List native Fusion Electronics command definitions exposed by the active Fusion session. Use this to discover command IDs before starting a command.",
		inputSchema: {
			type: "object",
			properties: {
				filter: {
					type: "string",
					description: "Optional case-insensitive substring matched against command id and display name.",
				},
				includeApplicability: {
					type: "boolean",
					description: "When true, includes each command definition's isApplicable state in the current Fusion context.",
					default: true,
				},
				limit: {
					type: "number",
					description: "Maximum number of commands to return.",
					default: 250,
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "fusion_mcp_electronics_start_command",
		description:
			"Start a native Fusion Electronics command by command ID, such as Electron::Wire, Electron::Via, Electron::RunScript, Electron::DRC, or Electron::ManualRoute. This is command control, not structured geometry authoring; verify effects with read tools.",
		inputSchema: {
			type: "object",
			properties: {
				commandId: {
					type: "string",
					description: "Fusion command definition ID to execute, for example Electron::Wire or Electron::DRC.",
				},
				stopActiveCommand: {
					type: "boolean",
					description: "Stop the current Electronics command before starting the new one.",
					default: true,
				},
				useTextCommand: {
					type: "boolean",
					description: "Use Application.executeTextCommand('Commands.Start <id>') instead of CommandDefinition.execute().",
					default: true,
				},
			},
			required: ["commandId"],
			additionalProperties: false,
		},
	},
	{
		name: "fusion_mcp_electronics_text_command",
		description:
			"Execute a raw Fusion text command in the active Fusion session. This can mutate designs. Prefer specific tools when possible and verify with readback.",
		inputSchema: {
			type: "object",
			properties: {
				command: {
					type: "string",
					description: "Raw command string passed to adsk.core.Application.executeTextCommand.",
				},
				stopActiveCommand: {
					type: "boolean",
					description: "Stop the current Electronics command before running the text command.",
					default: true,
				},
			},
			required: ["command"],
			additionalProperties: false,
		},
	},
	{
		name: "fusion_mcp_electronics_export_eagle",
		description:
			"Export the active Electronics schematic, board, library, or linked document to EAGLE 9.6.2 .sch/.brd/.lbr format using Fusion's ElectronicsExportManager.",
		inputSchema: {
			type: "object",
			properties: {
				documentType: {
					type: "string",
					enum: ["auto", "schematic", "board", "library", "linkedBoard", "linkedSchematic"],
					description: "Which Electronics document to export. auto uses the active product type.",
					default: "auto",
				},
				outputPath: {
					type: "string",
					description: "Absolute output path ending in .sch, .brd, or .lbr.",
				},
			},
			required: ["outputPath"],
			additionalProperties: false,
		},
	},
	{
		name: "fusion_mcp_electronics_run_python",
		description:
			"Run a Python snippet with Electronics helpers in the active Fusion session. The snippet can mutate the active design. Use for advanced controlled writes after API grounding.",
		inputSchema: {
			type: "object",
			properties: {
				body: {
					type: "string",
					description:
						"Python body code to execute. Available locals: app, ui, product, begin_change(target, label), end_change(target), cancel_change(target), args.",
				},
				args: {
					type: "object",
					description: "JSON-serializable arguments available to the snippet as args.",
					additionalProperties: true,
				},
				changeLabel: {
					type: "string",
					description: "Optional transaction label used if the snippet calls begin_change.",
					default: "MCP Electronics change",
				},
			},
			required: ["body"],
			additionalProperties: false,
		},
	},
];

for (const tool of localTools) {
	localToolNames.add(tool.name);
}

async function listRemoteTools(params = {}) {
	if (!remoteToolsCache || params.cursor) {
		const result = await callFusion("tools/list", params);
		if (!params.cursor) {
			remoteToolsCache = result;
		}
		return result;
	}
	return remoteToolsCache;
}

async function listTools(params = {}) {
	const remote = await listRemoteTools(params);
	if (params.cursor) {
		return remote;
	}

	const remoteTools = (remote.tools ?? []).filter((tool) => !localToolNames.has(tool.name));
	return {
		...remote,
		tools: [...remoteTools, ...localTools],
	};
}

async function handleLocalTool(name, args = {}) {
	switch (name) {
		case "fusion_mcp_electronics_list_commands":
			return handleListCommands(args);
		case "fusion_mcp_electronics_start_command":
			return handleStartCommand(args);
		case "fusion_mcp_electronics_text_command":
			return handleTextCommand(args);
		case "fusion_mcp_electronics_export_eagle":
			return handleExportEagle(args);
		case "fusion_mcp_electronics_run_python":
			return handleRunPython(args);
		default:
			throw new Error(`Unknown local tool: ${name}`);
	}
}

async function handleListCommands(args) {
	const filter = typeof args.filter === "string" ? args.filter : "";
	const includeApplicability = requireBoolean(args.includeApplicability, "includeApplicability", true);
	const limit = limitNumber(args.limit, 250, 1000);

	const script = `
import adsk.core

def run(_context: str):
    app = adsk.core.Application.get()
    ui = app.userInterface
    needle = ${escapePythonString(filter)}.lower()
    include_applicability = ${includeApplicability ? "True" : "False"}
    limit = ${limit}
    rows = []
    for cd in ui.commandDefinitions:
        cid = cd.id or ""
        name = cd.name or ""
        if not (cid.startswith("Electron::") or cid.startswith("Electronics") or "Electron" in cid or "Eagle" in cid):
            continue
        haystack = (cid + " " + name).lower()
        if needle and needle not in haystack:
            continue
        row = {"id": cid, "name": name}
        if include_applicability:
            try:
                row["isApplicable"] = bool(cd.isApplicable)
            except Exception as ex:
                row["isApplicableError"] = str(ex)
        rows.append(row)
        if len(rows) >= limit:
            break
    print(${escapePythonString("__FUSION_ELECTRONICS_COMMANDS__")} + __import__("json").dumps(rows, indent=2))
`;
	return runFusionScript(script);
}

async function handleStartCommand(args) {
	const commandId = requireString(args.commandId, "commandId");
	const stopActiveCommand = requireBoolean(args.stopActiveCommand, "stopActiveCommand", true);
	const useTextCommand = requireBoolean(args.useTextCommand, "useTextCommand", true);

	const script = `
import adsk.core

def run(_context: str):
    app = adsk.core.Application.get()
${commandPrelude(stopActiveCommand)}
    command_id = ${escapePythonString(commandId)}
    cmd = ui.commandDefinitions.itemById(command_id)
    if not cmd:
        raise RuntimeError("No command definition found for " + command_id)
    applicable = bool(cmd.isApplicable)
    if not applicable:
        raise RuntimeError("Command is not applicable in the active Fusion context: " + command_id)
    if ${useTextCommand ? "True" : "False"}:
        result = app.executeTextCommand("Commands.Start " + command_id)
        print(result)
    else:
        print(cmd.execute())
`;
	return runFusionScript(script);
}

async function handleTextCommand(args) {
	const command = requireString(args.command, "command");
	const stopActiveCommand = requireBoolean(args.stopActiveCommand, "stopActiveCommand", true);

	const script = `
import adsk.core

def run(_context: str):
    app = adsk.core.Application.get()
${commandPrelude(stopActiveCommand)}
    print(app.executeTextCommand(${escapePythonString(command)}))
`;
	return runFusionScript(script);
}

async function handleExportEagle(args) {
	const documentType = typeof args.documentType === "string" ? args.documentType : "auto";
	const outputPath = requireString(args.outputPath, "outputPath");

	const script = `
import adsk.core
import adsk.electron

def run(_context: str):
    app = adsk.core.Application.get()
    product = app.activeProduct
    if product is None:
        raise RuntimeError("No active Fusion product")
    requested = ${escapePythonString(documentType)}
    output_path = ${escapePythonString(outputPath)}

    target = product
    if requested == "linkedBoard":
        target = getattr(product, "linkedBoard", None)
    elif requested == "linkedSchematic":
        target = getattr(product, "linkedSchematic", None)
    elif requested == "board" and product.objectType != adsk.electron.Board.classType():
        parent = getattr(product, "parentDesign", None)
        target = getattr(parent, "board", None) if parent else getattr(product, "linkedBoard", None)
    elif requested == "schematic" and product.objectType != adsk.electron.Schematic.classType():
        parent = getattr(product, "parentDesign", None)
        target = getattr(parent, "schematic", None) if parent else getattr(product, "linkedSchematic", None)
    elif requested == "library" and product.objectType != adsk.electron.Library.classType():
        target = None

    if target is None:
        raise RuntimeError("Could not resolve Electronics document for export type: " + requested)

    manager = getattr(target, "exportManager", None)
    if manager is None:
        raise RuntimeError("Resolved target does not expose exportManager: " + target.objectType)

    lower = output_path.lower()
    if lower.endswith(".brd"):
        options = manager.createEagleBrdExportOptions(output_path)
    elif lower.endswith(".sch"):
        options = manager.createEagleSchExportOptions(output_path)
    elif lower.endswith(".lbr"):
        options = manager.createEagleLbrExportOptions(output_path)
    else:
        raise RuntimeError("outputPath must end in .brd, .sch, or .lbr")

    if options is None:
        raise RuntimeError("Fusion did not create export options for " + output_path)
    ok = manager.execute(options)
    print({"success": bool(ok), "outputPath": output_path, "targetType": target.objectType})
`;
	return runFusionScript(script);
}

async function handleRunPython(args) {
	const body = requireString(args.body, "body");
	const snippetArgs = args.args ?? {};
	const changeLabel = typeof args.changeLabel === "string" && args.changeLabel.trim()
		? args.changeLabel
		: "MCP Electronics change";

	const indentedBody = body
		.split("\n")
		.map((line) => `    ${line}`)
		.join("\n");

	const script = `
import adsk.core
import json

def run(_context: str):
    app = adsk.core.Application.get()
    ui = app.userInterface
    product = app.activeProduct
    args = json.loads(${escapePythonJson(snippetArgs)})
    change_label = ${escapePythonString(changeLabel)}

    def begin_change(target=None, label=None):
        target = target or product
        if hasattr(target, "beginDesignChange"):
            return target.beginDesignChange(label or change_label)
        raise RuntimeError("Target does not support beginDesignChange")

    def end_change(target=None):
        target = target or product
        if hasattr(target, "endDesignChange"):
            return target.endDesignChange()
        raise RuntimeError("Target does not support endDesignChange")

    def cancel_change(target=None):
        target = target or product
        if hasattr(target, "cancelDesignChange"):
            return target.cancelDesignChange()
        raise RuntimeError("Target does not support cancelDesignChange")

${indentedBody}
`;
	return runFusionScript(script);
}

async function callTool(params = {}) {
	const name = requireString(params.name, "name");
	const args = params.arguments ?? {};
	if (localToolNames.has(name)) {
		return handleLocalTool(name, args);
	}
	return callRemoteTool(name, args);
}

async function handleRequest(message) {
	const { method, params } = message;
	try {
		switch (method) {
			case "initialize":
				return {
					protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
					serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
					capabilities: {
						tools: { listChanged: false },
						resources: {},
					},
				};
			case "notifications/initialized":
				return {};
			case "ping":
				await ensureFusionInitialized();
				return {};
			case "tools/list":
				return listTools(params ?? {});
			case "tools/call":
				return callTool(params ?? {});
			case "resources/list":
			case "resources/templates/list":
			case "resources/read":
				return callFusion(method, params ?? {});
			default:
				return callFusion(method, params ?? {});
		}
	} catch (error) {
		if (method === "tools/call") {
			return errorResult(errorMessage(error));
		}
		throw error;
	}
}

async function handleNotification(message) {
	if (message?.method === "notifications/initialized") {
		return;
	}
}

async function handleLine(line) {
	let message;
	try {
		message = JSON.parse(line);
	} catch (error) {
		writeMessage({
			jsonrpc: "2.0",
			error: { code: -32700, message: `Parse error: ${errorMessage(error)}` },
			id: null,
		});
		return;
	}

	if (!message || typeof message !== "object") {
		writeMessage({
			jsonrpc: "2.0",
			error: { code: -32600, message: "Invalid Request" },
			id: null,
		});
		return;
	}

	if (!Object.prototype.hasOwnProperty.call(message, "id")) {
		await handleNotification(message);
		return;
	}

	if (typeof message.method !== "string") {
		writeMessage({
			jsonrpc: "2.0",
			error: { code: -32600, message: "Invalid Request" },
			id: message.id ?? null,
		});
		return;
	}

	try {
		const result = await handleRequest(message);
		writeMessage({ jsonrpc: "2.0", id: message.id, result });
	} catch (error) {
		writeMessage({
			jsonrpc: "2.0",
			id: message.id,
			error: {
				code: error instanceof JsonRpcError && Number.isInteger(error.code) ? error.code : -32603,
				message: errorMessage(error),
				...(error instanceof JsonRpcError && error.data !== undefined ? { data: error.data } : {}),
			},
		});
	}
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
	inputBuffer += chunk;
	let newlineIndex = inputBuffer.indexOf("\n");
	while (newlineIndex !== -1) {
		const line = inputBuffer.slice(0, newlineIndex).replace(/\r$/, "");
		inputBuffer = inputBuffer.slice(newlineIndex + 1);
		newlineIndex = inputBuffer.indexOf("\n");
		if (!line.trim()) {
			continue;
		}
		void handleLine(line);
	}
});

process.stdin.on("end", () => {
	if (inputBuffer.trim()) {
		void handleLine(inputBuffer.replace(/\r$/, ""));
	}
});

process.on("SIGINT", () => {
	process.exit(0);
});

process.on("SIGTERM", () => {
	process.exit(0);
});

log(`running; augmenting ${fusionUrl}`);
