---
name: new-workspace
description: Create an isolated workspace on the Notis cloud computer to work on a task in a configured repository, commit the work to that branch, and track it as a draft pull request from the first commit onwards. Use when the user wants to start work on a bug, feature, or pull request, asks for a new branch or worktree, or wants the state of workspaces and their pull requests refreshed.
---

# New workspace

Creates one workspace per task: a git worktree of a configured repository, on
its own branch, with the repository's secrets already in place. Work happens
inside that directory, is committed to that branch, and is visible as a draft
pull request from the first commit onwards.

Requires a repository configured by the **new-repository** skill. If there is
none, run that first — do not clone by hand.

## Scripts

The scripts live in the **workspaces-shared** skill, which is one copy shared
with **new-repository** rather than two that drift apart.

```bash
S=/vercel/sandbox/.notis/skills/workspaces-shared/scripts
```

| Call | Does |
|---|---|
| `bash $S/workspace.sh new <repo> --task "..."` | Create the worktree and branch |
| `bash $S/workspace.sh new <repo> --task "..." --continue-branch B` | Same, but working **on** existing branch `B` |
| `bash $S/workspace.sh setup <repo> <name>` | Run the repository's setup, detached |
| `bash $S/workspace.sh sync <repo> <name>` | Refresh git and pull request state |
| `bash $S/workspace.sh pr <repo> <name> --draft --title T` | Push and open the draft pull request |
| `bash $S/workspace.sh list [repo]` | Existing workspaces |
| `bash $S/workspace.sh remove <repo> <name>` | Drop the tree, keep the branch |
| `bash $S/job.sh status\|log\|wait <job>` | Follow anything detached |

## Creating one

```bash
bash $S/workspace.sh new notis --task "fix duplicate reminders on lapsed accounts"
bash $S/workspace.sh new notis --task "review the slack retry patch" --pr 1829
bash $S/workspace.sh new notis --task "port the cron fix" --base production
bash $S/workspace.sh new notis --task "finish the auth refactor" --continue-branch feat/auth
```

Defaults, and when to override them:

- **Base** is the repository's default branch. Use `--base` when the user names
  a branch, and `--pr N` when they want to continue or review a pull request —
  that branches from the pull request head, so the work carries on from it
  rather than starting beside it.
- **`--continue-branch B`** is the fourth mode, and the only one that does not
  create a branch: it checks out `B` itself, so commits land on the branch
  someone is already working on. Use it when a hand-over says to continue a
  branch, never to start fresh work. `B` must already be on origin. If `B` is
  checked out somewhere else — including the canonical checkout, which sits on
  the default branch — the script refuses and names the holder; work in that
  workspace, or start beside it with `--base B`.
- **Branch** is `notis/<task-slug>`, derived from the task. Keep it. Override
  with `--branch` only when the user names a branch, and never by inferring a
  convention from other branches in the repository -- those were made by other
  tools and are not this one's.

  **Every branch this skill creates is prefixed `notis/`, including one named
  with `--branch`.** The script adds the prefix itself, so `--branch fix-login`
  becomes `notis/fix-login` and there is no way to opt out. The prefix is how
  someone reading `git branch -r` tells this tool's work from their own; do not
  promise the user a bare branch name. The one exception is
  `--continue-branch`, which adopts a branch that already exists on the remote
  and therefore leaves its name alone.
- **Name** is the task slug. Pass `--name` to shorten a long one.

The task text is required: it names the branch and is what Conductor
shows for the row. Use the user's own words, not a paraphrase.

Creation copies the repository's staged env files into the new tree. Never copy
them by hand, never print them, and never commit them.

## Hand-overs from someone's terminal

A task that opens with `[Hand-over from a local terminal]` came from
`notis handover` — a coding agent on the user's own machine pushed its branch
and asked you to carry on. Those messages name the repository, the branch, and
whether to continue that branch or start beside it. Read them literally:

- **Continue this branch** → `--continue-branch <branch>`. Your commits go onto
  a branch a person also has checked out locally, so push normally and **never
  force-push**: you would destroy work you cannot see.
- **New branch from it** → `--base <branch>`.

The branch is already on origin when the hand-over arrives; you do not need to
ask for it to be pushed. A pull request may already exist for it — `workspace.sh
pr` reuses one rather than failing, and opening a second is still never the
answer.

If the repository is not configured on the cloud computer yet, run the
**new-repository** skill first, then create the workspace.

Never call `notis handover` yourself. It exists to bring work *to* you; calling
it from here would hand your own task back to Notis in a loop. The Notis CLI
refuses it in this context anyway.

## Reviews an automation started

When a review reaches you from an automation rather than from a person, nobody
is watching the conversation it runs in. The pull request is the only place the
work is visible, so it has to say both that the review started and how it ended.

**Claim it before you read a single file.** One comment, posted once:

```bash
gh api repos/{owner}/{repo}/issues/<pr>/comments \
  -f body='👀 <!-- notis-review -->'
```

The eyes say a review is under way, the way a person reacting to a pull request
does. The HTML comment is invisible when rendered and is how you find this
comment again — never search for the emoji, which anyone may have used.

**Then edit that same comment when the review ends.** Find it by its marker and
patch it in place:

```bash
id=$(gh api repos/{owner}/{repo}/issues/<pr>/comments --paginate \
  --jq '[.[] | select(.body | contains("<!-- notis-review -->"))] | last | .id')
gh api -X PATCH repos/{owner}/{repo}/issues/comments/$id -F body=@review.md
```

Editing rather than replying is the whole point: the pull request keeps one
Notis comment that always shows the current state, and nobody is notified four
times for one review. Reviewing again after a new push edits the same comment
again — never stack a second one. Do not use `gh pr comment --edit-last`: it
edits whatever you posted last, which is the artifact comment if you posted
one.

The closing body replaces the eyes and answers three questions, in this order:

- **Tested** — what you actually ran, and the result. A suite that was not run
  is not a suite that passed; if you skipped it, say which and why.
- **Fixed** — what you changed, or `Nothing` in as many words. A review that
  found nothing is a result, not an empty section.
- **Committed** — the commits you pushed, by short sha and subject, and the
  branch they are on. If you committed nothing, say that too.

Keep the marker on the end of the closing body so the next run can find it.
Screenshots and reports follow the rules in the next section — a link in this
comment, never a commit into the branch.

## Working in it

**Everything runs inside the workspace path.** `cd` there first, or pass its
path explicitly. Running a build or a test from the canonical checkout is the
one mistake that makes a workspace pointless — it pollutes the shared tree and
proves nothing about the branch.

Dependencies are not shared between worktrees. Run `workspace.sh setup` and wait
for the job before running or testing anything, unless the repository builds
without an install step.

## Opening the draft pull request

**Open it as a draft as soon as the branch has its first commit — not at the
end of the work.** The pull request is the only way a workspace can be tracked
from outside this conversation: once this context window is gone, commits that
live only in the sandbox worktree are invisible to the user and to whoever picks
the task up next. A workspace with no pull request reads as a workspace where
nothing happened.

```bash
bash $S/workspace.sh pr notis <name> --draft \
  --title "Fix duplicate reminders" --body "..."
```

This pushes the branch, opens the pull request with the GitHub CLI, and syncs
the row. `gh pr create` needs at least one commit ahead of base, so the order is
always: commit first, then open the draft, then keep committing onto it.

Leave it a draft until the user says the work is ready for review. When it is,
mark the existing one ready from inside the workspace with `gh pr ready` — never
open a second pull request for the same branch.

**Use `workspace.sh pr` rather than calling `gh pr create` yourself.** A
hand-rolled `gh pr create` opens a real pull request that the app never learns
about, so the workspace keeps reporting that it has none.

Before committing, check `git status` for env files. If one appears, it is
staged wrongly — stop and fix the ignore rules rather than committing it.

## Putting artifacts on the pull request

Two kinds of artifact, two destinations. They are not interchangeable, and
choosing wrong ships a link that renders as raw markup or 404s for the reader.

**Screenshots and video go to GitHub.**

```bash
bash $S/attach.sh .reports/pr-1884/before.png
```

That prints a `github.com/user-attachments/assets/...` URL. Put it on its own
line in the comment or description and GitHub renders the image, or a player
for `.mp4`, `.mov` and `.webm`. The asset inherits the repository's visibility:
on a private repository it 404s for anyone who is not a collaborator.

Do not commit screenshots into the branch. They sit in the history forever for
something that is read once, and the diff is unreviewable.

**HTML reports go to Notis.** GitHub refuses `text/html` outright, and so does
Supabase storage, which serves the attachments bucket as `text/plain` no matter
what was uploaded. So export the file and post the viewer link:

1. `LOCAL_NOTIS_DOWNLOAD_SANDBOX_FILE` with the file's sandbox path.
2. The response carries `url` (the storage object) and, for an `.html` file,
   `view_url` (a Notis page that renders it).
3. Put **`view_url`** in the comment. `url` is unrendered markup and is only
   useful as an attachment.

The viewer is auth-gated to whoever owns the file, so a reviewer signed in to a
different account sees nothing. Say so when you post the link rather than
letting them discover it.

**Never paste a Supabase storage URL into a pull request.** Inside a Notis
message `/send` quietly rewrites those links to the viewer for you; a GitHub
comment never crosses that boundary, so whatever you wrote is what ships.

## Before returning to the user

**Never end a turn with work sitting uncommitted in the worktree.** Every time
you hand control back — finished, blocked, or asking a question — do all four:

1. `git -C <path> status` — env files here mean the ignore rules are wrong, not
   that they should be committed.
2. Commit everything belonging to the task onto the workspace's branch.
3. Get it onto the remote: `workspace.sh pr ... --draft` if the pull request
   does not exist yet, otherwise `git -C <path> push`.
4. `bash $S/workspace.sh sync <repo> <name>` so the row and the pull request
   match the tree.

Uncommitted work is unreviewable, invisible in the app, and one
`workspace.sh remove` away from being gone. If something genuinely cannot be
committed — a broken build mid-refactor — commit it anyway on the draft branch
and say so in the message; the draft is the place for work in progress.

## Keeping the app honest

`workspace.sh sync <repo> <name>` refreshes commits ahead of base, uncommitted
file count, pull request state and the check rollup. Run it:

- after opening a pull request,
- when the user asks how something is going,
- before saying a workspace is finished.

The app follows the database live, so a row you write appears there without
anyone reloading. What it cannot do is notice a commit or a review: git and the
GitHub CLI are only read when `sync` runs. So the view is live and the *facts in
it* are as old as the last sync — if you have not synced, say so rather than
presenting the branch and pull request state as current.

**`sync` is the repair tool.** When a row looks stale or wrong, run it before
reaching for anything else. It rebuilds every field it owns from git and the
GitHub CLI, and it is the supported way to fix a row -- do not hand-write one
field at a time.

## Finishing

When a pull request is merged, `workspace.sh remove <repo> <name>` drops the
tree and marks the row `Archived`. The branch is kept — it is already on the
remote and may still be referenced.

Do not remove a workspace with uncommitted changes without saying what would be
lost and getting an answer.
