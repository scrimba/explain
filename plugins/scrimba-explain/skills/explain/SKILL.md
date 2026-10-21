---
name: explain
description: Create a Scrimba video explainer — an instantly generated video with narration, animations, mermaid diagrams, LaTeX maths, and precisely composed code walkthroughs, rendered live on scrimba.com. Use when the user wants something explained visually or as a video, or asks for an explainer or walkthrough of code, a concept, a flow, an architecture, a git branch, a PR, a diff, or the changes you made in this session. Also use for playlists or courses of lessons.
---

# Scrimba Explain

Scrimba Explain turns anything into a rich explainer with narration and visual aids, built live at a shareable scrimba.com URL. It shines for:

- Code diffs (side-by-side before/after)
- Concepts and learning topics
- Flows and architectures
- Code walkthroughs with precise highlighting
- Mermaid diagrams and LaTeX maths

## The tools

Use the Scrimba MCP tools when you have them: `start_explainer_stream`, `append_explainer_chunk` and `finish_explainer_stream`, plus `create_playlist` for a playlist or course. The `scrimba-explain` server explains anything; the `scrimba-code` server explains code changes.

Without the MCP tools, use `scripts/scrimba.mjs` in this skill's folder. It needs Node and network access:

```sh
node scripts/scrimba.mjs start  --endpoint explain --title "…" --description "…"
node scripts/scrimba.mjs push   --endpoint explain --token <stream_token> <<'SCRIMBA_EOF'
…explainer markup…
SCRIMBA_EOF
node scripts/scrimba.mjs finish --endpoint explain --token <stream_token> --guide <guide>
```

`start` prints the link, the stream token, the guide id and the path of a file that holds the explainer markup contract. Use `--endpoint code` for an explainer of code changes.

## Explain anything

1. Start a stream with `start_explainer_stream` (or the script's `start`).
2. Give the user the link at once. They open it, sign in to Scrimba, and claim the explainer to watch it get built live.
3. Read the contract (see "The contract" below), then push the explainer with `append_explainer_chunk`, one slide at a time, and close it with `finish_explainer_stream`.

For a playlist or course of lessons, use `create_playlist`: you plan the curriculum and author every lesson through the same streaming flow.

## Explain your own changes

Use this when the user asks for an explainer of the changes you made in this session, or accepts the offer of one.

1. Write a brief, for yourself or for the agent that writes the explainer: what the user asked for and why, in their words where you can; what you changed and how the parts connect, with the main decisions and the alternatives you rejected; what you are unsure of, did not test, or the user should check; and what to diff against (the commit before your first change, or the working tree).
2. Start a stream on the code endpoint:
   - In Claude Code, run `node "<this skill's folder>/scripts/scrimba.mjs" start --endpoint code --title "…" --description "…"`, so that the contract goes to a file and not into this conversation.
   - Elsewhere, call `start_explainer_stream` on the `scrimba-code` server.
3. Give the user the link: they open it, sign in to Scrimba, and claim the explainer to watch it.
4. In Claude Code, start the `scrimba-explainer` agent in the background. Give it the brief, the stream token, the guide id, the contract file path and this skill's folder, and end your turn. Elsewhere, write the explainer yourself, with "Writing the explainer" below.

## Writing the explainer

1. Read the contract to its end (see below).
2. For changes: run `git status --porcelain` and `git diff --stat` (or `git diff --stat <base>`), then read the diff of the one or two changes that carry the idea. Untracked files do not show in `git diff`; read them whole. Decide the shape.
3. Write one slide at a time: one `append_explainer_chunk` call per slide, the item with its say. Before a slide shows code, read that code as it is now, and its callers or tests when the slide makes a claim about them. A brief is your map: check its claims in the code, but do not work out again what it already tells you.
4. Close the stream with `finish_explainer_stream`.

Never start a second stream; if a chunk is refused, fix it and push it again on the same stream. When a call fails with a server error or a timeout, try it again at most twice, a few seconds apart. If it still fails, stop and say which call failed with what error.

## The contract

The result of `start_explainer_stream` is not a status message. It holds the explainer link and the **complete explainer markup contract**, more than 50 KB: the format that every chunk you push must follow. The script's `start` writes the contract to a file instead.

- Many agents shorten or save large tool results. If you see only part of the result, open the saved file and read it to the end.
- A complete contract ends with the line `END OF EXPLAINER CONTRACT`. Never write markup from part of the contract; if you cannot read all of it, say so.

The streaming and tokens are mechanics for you; do not narrate them to the user. Say that you are making their Scrimba explainer, and give them the link.
