---
name: workspaces-shared
description: Carries the shell and Python scripts that Conductor's new-repository and new-workspace skills run on the cloud computer. It is not a task skill and has no procedure of its own; run new-repository to configure a repository and new-workspace to start work on one.
---

# Conductor shared scripts

This skill exists to put one copy of Conductor's workspace scripts on the cloud
computer. `new-repository` and `new-workspace` both call them from here, so a
fix to a script is a fix for both rather than two copies that drift apart.

A declared skill directory is packaged whole and materialized at
`/vercel/sandbox/.notis/skills/<name>/`, and nothing outside a declared
directory travels with it. Carrying the scripts in their own directory is what
makes each declared skill self-contained without duplicating them in the repo.

```
/vercel/sandbox/.notis/skills/workspaces-shared/scripts/
```

| Script | Owned by |
|---|---|
| `gh_login.py` | GitHub device sign-in |
| `repo.sh` | Repository clone, discovery, secrets, setup, sync |
| `workspace.sh` | Worktree create, setup, sync, draft pull request, remove |
| `job.sh` | Detached jobs and their logs |
| `attach.sh` | Uploads one screenshot or video to GitHub and prints the URL to embed |
| `notis_rows.py` | Reads and writes the app's database rows |
| `ensure_schema.py` | Brings the `repositories` schema up to what the scripts write (idempotent; `repo.sh` runs it once per session before its first row write) |

There is nothing to do here. Read `new-repository` or `new-workspace` for the
procedure; each names the calls it needs and the order they go in.
