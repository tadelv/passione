# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in `tadelv/passione`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Obsidian mirror

The user maintains a personal tracking note at vault path `Professional/Decent/Passione.md`. After creating, closing, or significantly updating a GitHub issue, mirror a one-line summary to that note via the `obsidian-cli` skill (or the `mcp__obsidian__*` tools).

- Mirror format: `- [ ] #<number> <title> — <state>` (use `[x]` for closed).
- Append under a section heading that matches the work area, or a `## Issues` section if none fits.
- GitHub remains the source of truth — the Obsidian note is a personal index, not a write target. Never edit issue state by editing the note.
- Skip mirroring for trivial label-only edits or comment threads; mirror open/close/title-change events.
