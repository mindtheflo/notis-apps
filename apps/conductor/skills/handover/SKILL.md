---
name: handover
description: Hand the git branch you are working on to a Notis agent from a local terminal, so it continues the work on the Notis cloud computer or on the user's Mac. Use when you are a coding agent in the user's terminal and the task should keep running after this session ends, when the user asks to give work to Notis, Codex Cloud or Claude Cloud, or when a long refactor, test-fixing pass, or migration should continue elsewhere while you carry on with something else.
---

# Hand work over to Notis

You are a coding agent running in the user's terminal, on some git branch. This
skill gives that branch to a Notis agent, which picks the work up on the Notis
cloud computer — in its own git worktree, on its own or on your branch — and
keeps going after this session ends.

Use it when the work should outlive the terminal, when it is long enough to be
worth running in parallel with what you are doing, or when the user asks for it
by name. Do not use it for something you can finish here in a minute.

## The command

```bash
npx --package @notis_ai/cli@latest -- notis handover start "<task>" \
  [--branch-mode new|same] [--route <agent>] [--repo <slug>]
```

It commits any uncommitted changes, pushes the branch to origin, and starts the
Notis agent. Output is JSON when stdout is not a terminal, so read it directly.

### Branch mode — the decision that matters

| Mode | What happens | Use when |
|---|---|---|
| `new` (default) | The agent cuts a **new branch from yours** and works there | You are still working on this branch |
| `same` | The agent commits **onto your branch** | You are handing the branch over and stepping off it |

`same` means two parties commit to one branch. Keep working on it yourself only
if you are ready to pull the agent's commits down (`git pull --rebase`), and
never force-push it afterwards. When in doubt, use `new`.

### Route — which agent runs it

| `--route` | Runs on |
|---|---|
| `notis` (default) | The hosted Notis agent |
| `codex_cloud` | The user's own Codex, in their Notis cloud sandbox |
| `claude_cloud` | The user's own Claude Code, in their Notis cloud sandbox |
| `codex_local` | Codex on the user's Mac, through Notis Desktop |
| `claude_local` | Claude Code on the user's Mac, through Notis Desktop |
| `auto` | Notis picks whichever is ready |

The `_cloud` routes are the ones that keep running when the laptop closes, and
they bill the user's own Codex/Claude subscription rather than Notis credits.
The `_local` routes need Notis Desktop connected. Follow the user's wording: if
they said "give it to Codex", that is `codex_cloud` unless they said on their
Mac.

## Before you call it

1. **Say what you are handing over, in the user's terminology.** The task text is
   the only description the receiving agent gets (and in `new` mode it also names
   the branch). Write it as an instruction, not a label: "fix the failing auth
   tests and open a draft PR", not "auth tests".
2. **Leave the tree in a state worth continuing from.** Uncommitted changes are
   committed for you as a `wip:` commit and pushed, because the cloud workspace
   is built from origin and anything unpushed simply would not exist there. If
   you would rather commit them yourself first, do — or pass `--no-wip` to make
   the command refuse instead.
3. **Do not hand over what you have not read.** The receiving agent starts from
   the branch, not from this conversation. Anything it must know goes in the
   task text.

## After it returns

The JSON carries `branch`, `agent_routing` and `interaction_id`.
Tell the user which agent took it and on which branch, then carry on with your
own work.

```bash
npx --package @notis_ai/cli@latest -- notis handover status
git fetch origin <branch>          # pull the agent's commits down later
```

`handover status` reads coding-agent threads, which ride the separate
`user_owned_subagents` rollout — it can be unavailable on an account where
`handover start` works. That is not a failure of the hand-over.

The agent opens a **draft pull request** early, so that — not this terminal —
is where the work becomes visible. For a `notis` route the run appears in the
user's Notis conversation instead of as a coding-agent thread.

## When it refuses

- **`handover_from_delegated_context`** — you *are* a Notis agent already. Do
  the work here; handing it back would loop.
- **`working_tree_dirty`** with `--no-wip` — commit and push, or drop the flag.
- **`git_push_failed`** — the branch has to reach origin. Reconcile with
  `git pull --rebase` and retry; never force-push a branch you handed over.
- **`no_origin_remote` / `detached_head` / `not_a_git_repository`** — there is no
  branch on a remote for the agent to pick up. Fix that first.
- **`handover_rate_limited`** — too many hand-overs too fast. If you did not make
  them all, something is looping; stop it rather than retrying.
- **`handover_route_not_available_here`** — a local route was asked for from the
  hosted MCP, which cannot start an agent on the user's machine. Use a `_cloud`
  route, or hand over from the CLI.

If the repository has never been configured on the cloud computer, the hand-over
still succeeds: the receiving agent sets it up before starting. Say so, because
that first run takes longer.
