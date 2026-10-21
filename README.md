# Explain by Scrimba

Ask your coding agent to explain anything — a concept, a document, a codebase, an architecture, a git branch or PR, or the changes it just made — and a narrated slideshow is built live at a scrimba.com link, with animations, diagrams, maths, code walkthroughs and side-by-side diffs.

Try prompts like:

- "Explain the changes you made in this session"
- "Explain how OAuth works, with diagrams"
- "Make a video walkthrough of this PR for my colleague"

When the agent has changed a lot of code, Claude Code and Codex offer an explainer of the changes when the task is done (see [Offers](#offers)).

## Install

### Claude Code

```
/plugin marketplace add scrimba/explain
/plugin install scrimba-explain@scrimba
```

### Codex

```sh
codex plugin marketplace add scrimba/explain
codex plugin add scrimba-explain@scrimba
```

Then open `/hooks` in Codex and trust the two `scrimba-explain` hooks. Codex skips plugin hooks until you trust them; without them, everything works except the offers.

### Other agents

```sh
npx skills add scrimba/explain
```

installs the `explain` skill into OpenCode, Cursor, Copilot, Gemini CLI and many more. The skill uses the Scrimba MCP tools when the agent has them, and a small Node script in the skill's folder when it does not.

```sh
npx plugins add scrimba/explain
```

installs the plugin, with its MCP servers, into Cursor, Codex, Copilot CLI and VS Code.

### Plain MCP

No plugin needed: add `https://scrimba.com/mcp/explain` (Streamable HTTP, no auth) to any MCP client.

## Offers

The plugin counts the lines the agent changes in a session, with `git`, from the moment the session starts. Your own uncommitted changes from before that, lockfiles and build output do not count. When the changes reach 150 lines in at least 4 files, the agent finishes its task and then asks once:

- **Yes, explain the changes**: the agent writes a short brief (what you asked for, what it changed, its decisions and doubts) and opens an explainer. You get the link at once; open it, sign in to Scrimba and claim the explainer to watch it. In Claude Code, a background agent writes the explainer while you keep working.
- **Not now**: the agent asks again only when the changes have doubled.
- **Never in this project**: no more offers in this repository.

Set `SCRIMBA_EXPLAIN_MIN_LINES` and `SCRIMBA_EXPLAIN_MIN_FILES` to change the limit. The hooks need Node on your `PATH`.

## What leaves your machine

To build an explainer, the agent sends the explainer text, including the code it shows, to scrimba.com. Explainers start private: only you can watch them after you claim them, until you share them. The agent works with your model, so explainers spend your model tokens.

## What is in this repository

| Path | For |
|---|---|
| `.claude-plugin/marketplace.json` | Claude Code marketplace |
| `.agents/plugins/marketplace.json` | Codex marketplace |
| `plugins/scrimba-explain/` | The plugin: Claude Code, Codex and Agent Plugins manifests, MCP servers, the `explain` skill, the `scrimba-explainer` agent and the offer hooks |
| `plugins/scrimba-explain/hooks/scrimba-offer.mjs` | The offer logic, shared by the Claude Code and Codex hooks |
| `plugins/scrimba-explain/skills/explain/scripts/scrimba.mjs` | Starts, appends to and finishes an explainer over HTTP, for agents without the MCP tools |
