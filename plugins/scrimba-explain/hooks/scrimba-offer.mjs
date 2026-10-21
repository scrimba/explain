#!/usr/bin/env node
// Offers a Scrimba explainer when a coding agent has changed a lot of code.
//
// Agent hooks run this script with the agent's name as the only argument:
//   SessionStart  records the changes the working tree already has, so they
//                 do not count as the agent's work.
//   Stop          measures the changes since then. Past the limit, it makes
//                 the agent continue its turn and ask the user, once, whether
//                 they want an explainer of them. It offers again only when
//                 the changes have doubled.
//
// The hook input is the JSON that Claude Code and Codex send on stdin. Codex
// runs shell commands in a sandbox, so the agent never writes the opt-out
// itself: when the user picks "Never in this project", the agent replies with
// OFF_SENTENCE, and the next Stop hook, which runs outside the sandbox, records
// it from `last_assistant_message`.
//
// Environment: SCRIMBA_EXPLAIN_MIN_LINES (default 150) and
// SCRIMBA_EXPLAIN_MIN_FILES (default 4) set the limit.

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const MIN_LINES = Number(process.env.SCRIMBA_EXPLAIN_MIN_LINES || 150)
const MIN_FILES = Number(process.env.SCRIMBA_EXPLAIN_MIN_FILES || 4)
const OFF_SENTENCE = "Scrimba explainer offers are now off for this project."

// Changes that say little about the work: lockfiles, build output, snapshots.
const IGNORED = [
	/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|go\.sum|Gemfile\.lock|composer\.lock)$/,
	/(^|\/)(node_modules|dist|build|out|coverage|\.next|\.turbo|\.cache)\//,
	/\.(min\.js|min\.css|map|snap)$/,
]

const agent = process.argv[2] ?? "claude-code"
const dataDir = process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA || join(tmpdir(), "scrimba-explain")

function git(root, args) {
	return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
}

function repoRoot(cwd) {
	try {
		return git(cwd, ["rev-parse", "--show-toplevel"]).trim()
	} catch {
		return null
	}
}

function readJson(file, fallback) {
	try {
		return JSON.parse(readFileSync(file, "utf8"))
	} catch {
		return fallback
	}
}

function writeJson(file, value) {
	mkdirSync(join(dataDir, "sessions"), { recursive: true })
	writeFileSync(file, JSON.stringify(value))
}

// The working tree's changed files: a content signature, and the lines added
// and removed against HEAD (an untracked file counts all its lines as added).
function changes(root) {
	const files = new Map()
	const status = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0")
	for (let i = 0; i < status.length; i++) {
		const entry = status[i]
		if (!entry) continue
		const code = entry.slice(0, 2)
		const file = entry.slice(3)
		if (code[0] === "R" || code[0] === "C") i++
		if (IGNORED.some((re) => re.test(file))) continue
		files.set(file, { sig: signature(join(root, file)), additions: 0, deletions: 0, untracked: code === "??" })
	}
	let numstat = ""
	try {
		numstat = git(root, ["diff", "--numstat", "-z", "HEAD"])
	} catch {}
	for (const record of numstat.split("\0")) {
		const [added, removed, file] = record.split("\t")
		const entry = file && files.get(file)
		if (!entry) continue
		entry.additions = Number(added) || 0
		entry.deletions = Number(removed) || 0
	}
	for (const [file, entry] of files) {
		if (entry.untracked) entry.additions = lineCount(join(root, file))
	}
	return files
}

function signature(path) {
	try {
		const stat = statSync(path)
		if (!stat.isFile()) return "other"
		if (stat.size > 4 * 1024 * 1024) return `${stat.size}:${stat.mtimeMs}`
		return createHash("sha1").update(readFileSync(path)).digest("hex")
	} catch {
		return "deleted"
	}
}

function lineCount(path) {
	try {
		const stat = statSync(path)
		if (!stat.isFile() || stat.size > 4 * 1024 * 1024) return 0
		const text = readFileSync(path, "utf8")
		if (text.includes("\0")) return 0
		return text.split("\n").length - (text.endsWith("\n") ? 1 : 0)
	} catch {
		return 0
	}
}

function baselineOf(root) {
	const baseline = {}
	for (const [file, entry] of changes(root)) baseline[file] = entry.sig
	return baseline
}

function offerText(stats) {
	const size = `this session changed ${stats.files} files (+${stats.additions}/-${stats.deletions} lines)`
	const never = `If they pick "Never in this project", reply with exactly this sentence and nothing else: ${OFF_SENTENCE}`
	if (agent === "codex") {
		return [
			`Scrimba explainer offer from the scrimba-explain plugin: ${size}.`,
			"In one short message, ask the user whether they want a narrated Scrimba explainer of these changes: yes, not now, or never in this project. Then end your turn.",
			"If the user then says yes, follow the explain skill, section \"Explain your own changes\".",
			never,
		].join(" ")
	}
	return [
		`Scrimba explainer offer from the scrimba-explain plugin: ${size}.`,
		"Ask the user once with AskUserQuestion whether they want a narrated Scrimba explainer of these changes, with these options: \"Yes, explain the changes\", \"Not now\", \"Never in this project\".",
		"If they pick yes, follow the explain skill, section \"Explain your own changes\".",
		never,
		"If they pick \"Not now\", end your turn without comment.",
	].join(" ")
}

function main() {
	let input = {}
	try {
		input = JSON.parse(readFileSync(0, "utf8") || "{}")
	} catch {}
	const event = input.hook_event_name
	const root = input.cwd && repoRoot(input.cwd)
	if (!root || !input.session_id) return {}

	const sessionFile = join(dataDir, "sessions", `${String(input.session_id).replace(/[^\w.-]/g, "_")}.json`)
	const mutedFile = join(dataDir, "muted.json")
	const state = readJson(sessionFile, {})

	if (event === "SessionStart") {
		if (!state.baseline) writeJson(sessionFile, { ...state, baseline: baselineOf(root) })
		return {}
	}
	if (event !== "Stop") return {}

	const muted = readJson(mutedFile, [])
	if (String(input.last_assistant_message ?? "").includes(OFF_SENTENCE)) {
		if (!muted.includes(root)) writeJson(mutedFile, [...muted, root])
		return {}
	}
	if (input.stop_hook_active || muted.includes(root)) return {}
	// A session that started before the plugin was installed has no baseline;
	// its changes so far count as the starting point.
	if (!state.baseline) {
		writeJson(sessionFile, { ...state, baseline: baselineOf(root) })
		return {}
	}

	const stats = { files: 0, additions: 0, deletions: 0 }
	for (const [file, entry] of changes(root)) {
		if (state.baseline[file] === entry.sig) continue
		stats.files++
		stats.additions += entry.additions
		stats.deletions += entry.deletions
	}
	const size = stats.additions + stats.deletions
	if (stats.files < MIN_FILES || size < MIN_LINES || size < 2 * (state.offeredAt ?? 0)) return {}
	writeJson(sessionFile, { ...state, offeredAt: size })
	return { decision: "block", reason: offerText(stats) }
}

let output = {}
try {
	output = main()
} catch {}
process.stdout.write(JSON.stringify(output))
