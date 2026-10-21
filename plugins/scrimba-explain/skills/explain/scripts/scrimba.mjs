#!/usr/bin/env node
// Talks to the Scrimba Explain MCP endpoints over HTTP, for agents that have
// a shell but not the Scrimba MCP tools, or that must keep the explainer
// contract out of their own context.
//
//   node scrimba.mjs start  --endpoint changes|explain --title "…" --description "…" [--mode landscape]
//   node scrimba.mjs push   --endpoint changes|explain --token <stream_token>   (markup on stdin)
//   node scrimba.mjs finish --endpoint changes|explain --token <stream_token> --guide <guide>
//
// `start` writes the explainer markup contract to a file and prints JSON with
// the explainer link, the stream token, the guide id and the contract file.
// SCRIMBA_EXPLAIN_ORIGIN changes the server (default https://scrimba.com).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const PATHS = { changes: "/explain/changes/mcp", explain: "/mcp/explain" }

function options(argv) {
	const opts = {}
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith("--")) opts[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? true : argv[++i]
	}
	return opts
}

const [command, ...rest] = process.argv.slice(2)
const opts = options(rest)
const path = PATHS[opts.endpoint ?? "changes"]
if (!path) fail(`Unknown endpoint ${opts.endpoint}; use changes or explain.`)
const url = (process.env.SCRIMBA_EXPLAIN_ORIGIN || "https://scrimba.com").replace(/\/+$/, "") + path

let session = null
let id = 0
async function rpc(method, params) {
	const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" }
	if (session) headers["mcp-session-id"] = session
	const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) })
	session = res.headers.get("mcp-session-id") ?? session
	const text = await res.text()
	if (!res.ok) fail(`${method} failed with HTTP ${res.status}: ${text.slice(0, 500)}`)
	const body = JSON.parse(text)
	if (body.error) fail(`${method} failed: ${JSON.stringify(body.error)}`)
	return body.result
}

async function call(name, args) {
	await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "scrimba-explain-skill", version: "1" } })
	const result = await rpc("tools/call", { name, arguments: args })
	if (result.isError) fail(result.content?.map((c) => c.text).join("\n") || `${name} failed`)
	return result.structuredContent ?? JSON.parse(result.content?.[0]?.text ?? "{}")
}

function fail(message) {
	process.stderr.write(message + "\n")
	process.exit(1)
}

if (command === "start") {
	if (!opts.title) fail("start needs --title")
	const args = { title: opts.title }
	if (opts.description) args.description = opts.description
	if (opts.mode) args.mode = opts.mode
	const result = await call("start_explainer_stream", args)
	const dir = join(tmpdir(), "scrimba-explain")
	mkdirSync(dir, { recursive: true })
	const contractFile = join(dir, `${result.guide}-contract.md`)
	writeFileSync(contractFile, result.explainer_contract)
	process.stdout.write(JSON.stringify({ url: result.url, guide: result.guide, stream_token: result.stream_token, mode: result.mode, contract_file: contractFile }, null, 2) + "\n")
} else if (command === "push") {
	if (!opts.token) fail("push needs --token")
	const markup = readFileSync(0, "utf8")
	if (!markup.trim()) fail("push needs the markup on stdin")
	process.stdout.write(JSON.stringify(await call("append_explainer_chunk", { stream_token: opts.token, markup }), null, 2) + "\n")
} else if (command === "finish") {
	if (!opts.token) fail("finish needs --token")
	const args = { stream_token: opts.token }
	if (opts.guide) args.guide = opts.guide
	process.stdout.write(JSON.stringify(await call("finish_explainer_stream", args), null, 2) + "\n")
} else {
	fail("Usage: scrimba.mjs start|push|finish --endpoint changes|explain …")
}
