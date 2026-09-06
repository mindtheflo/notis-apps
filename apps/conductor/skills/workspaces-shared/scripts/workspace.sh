#!/usr/bin/env bash
#
# Create and track workspaces: one git worktree per task, on its own branch.
#
# A worktree rather than a second clone because it shares the object store with
# the canonical checkout. On a repository of any size that is the difference
# between a workspace appearing in seconds and one that has to re-download the
# whole history, and the sandbox disk is finite.
#
#   workspace.sh new <repo> --task "..." [--base REF | --pr N | --continue-branch B] [--name NAME]
#   workspace.sh setup <repo> <name>      run the repository's setup, detached
#   workspace.sh sync <repo> <name>       refresh git and pull request state
#   workspace.sh pr <repo> <name> --title T [--body B] [--draft]
#   workspace.sh list [repo]
#   workspace.sh remove <repo> <name>
#
# The expected order is commit -> pr --draft -> keep committing. `gh pr create`
# needs one commit ahead of base, and the pull request is the only place a
# workspace is visible once the conversation that created it is gone, so it is
# opened as a draft at the first commit rather than at the end of the work.
# Mark it ready with `gh pr ready` from inside the worktree; opening a second
# pull request for the same branch is never the answer.
#
# --base branches beside the given ref; --continue-branch checks out that branch
# itself, so commits land on the branch someone else is already working on. That
# is what a hand-over from a local terminal asks for, and it is why the mode
# refuses on divergence rather than resolving it: the local clone the work came
# from is not visible here, so any reconciliation would be a guess.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_ROOT="${NOTIS_WORKSPACES_STATE:-/vercel/sandbox/.notis/workspaces}"
REPOS_ROOT="${NOTIS_REPOS_ROOT:-/vercel/sandbox/repositories}"
TREES_ROOT="${NOTIS_TREES_ROOT:-/vercel/sandbox/workspaces}"
JOB="bash $HERE/job.sh"
ROWS="${NOTIS_ROWS_COMMAND:-python3 $HERE/notis_rows.py}"
REPO="bash $HERE/repo.sh"

die() { echo "error: $*" >&2; exit 1; }

# Same helper as repo.sh: the cloud computer has sha256sum, a developer Mac has
# shasum, and these two scripts are subprocesses of each other, not sourced.
sha256() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}
validate_segment() {
    local label="$1" value="$2"
    [[ "$value" =~ ^[a-z0-9][a-z0-9._-]{0,63}$ ]] \
        && [ "$value" != "." ] && [ "$value" != ".." ] \
        || die "invalid $label: $value"
}
validate_ref() {
    local label="$1" value="$2"
    [[ "$value" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$ ]] \
        && [[ "$value" != *..* ]] && [[ "$value" != *//* ]] \
        && [[ "$value" != */ ]] && [[ "$value" != *.lock ]] \
        || die "invalid $label: $value"
}
repo_path() { printf '%s/%s' "$REPOS_ROOT" "$1"; }
tree_path() { printf '%s/%s/%s' "$TREES_ROOT" "$1" "$2"; }

slugify() {
    printf '%s' "$1" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
        | cut -c1-48 \
        | sed -E 's/-+$//'
}

# The recorded default branch is the fast path. When the row is missing or the
# field is empty, ask the remote rather than guessing "main": a repository whose
# default is something else fails with `invalid reference: origin/main`, which
# reads like a git problem rather than a missing row.
default_branch_for() {
    local repo="$1" source_repo
    local recorded
    recorded="$(row_field "$repo" 'Default branch')"
    if [ -n "$recorded" ]; then printf '%s' "$recorded"; return 0; fi
    source_repo="$(repo_path "$repo")"
    git -C "$source_repo" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null \
        | sed 's|^origin/||' \
        || git -C "$source_repo" branch --show-current 2>/dev/null \
        || printf 'main'
}

row_field() {
    $ROWS get repositories --name "$1" \
        | python3 -c "import json,sys; print((json.load(sys.stdin) or {}).get('$2') or '')"
}

case "${1:-}" in

dev|dev-status|dev-url|dev-stop)
    action="$1"; repo="${2:?repository required}"; name="${3:?workspace required}"; shift 3
    validate_segment "repository slug" "$repo"
    validate_segment "workspace name" "$name"
    target="$(tree_path "$repo" "$name")"
    [ -d "$target" ] || die "no workspace at $target"
    case "$action" in
        dev)
            dev_cmd="$(row_field "$repo" 'Dev command')"
            [ -n "$dev_cmd" ] || die "repository '$repo' has no dev command recorded"
            [ "$#" -eq 0 ] || { [ "$#" -eq 1 ] && [ "$1" = "--entry-artifact" ]; } || die "unknown dev option"
            # Notis's saved command explicitly opts into its Portal artifact.
            if [[ "$dev_cmd" == *"--with-portal"* ]] && [ -f "$target/scripts/conductor_dev_port_lease.py" ]; then
                set -- --entry-artifact
            fi
            python3 "$HERE/preview.py" open "$target" --command "$dev_cmd" "$@"
            ;;
        *)
            [ "$#" -eq 0 ] || die "unexpected argument"
            case "$action" in dev-status) verb=status ;; dev-url) verb=url ;; dev-stop) verb=stop ;; esac
            python3 "$HERE/preview.py" "$verb" "$target"
            ;;
    esac
    ;;

new)
    repo="$2"; shift 2
    validate_segment "repository slug" "$repo"
    task=""; base=""; pr=""; name=""; branch=""; continue_branch=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --task) task="$2"; shift 2 ;;
            --base) base="$2"; shift 2 ;;
            --pr) pr="$2"; shift 2 ;;
            --name) name="$2"; shift 2 ;;
            --branch) branch="$2"; shift 2 ;;
            --continue-branch) continue_branch="$2"; shift 2 ;;
            *) die "unknown option $1" ;;
        esac
    done
    [ -n "$task" ] || die "--task is required: the branch is named after it"
    if [ -n "$continue_branch" ]; then
        [ -z "$pr" ] || die "--continue-branch and --pr are mutually exclusive"
        [ -z "$base" ] || die "--continue-branch and --base are mutually exclusive"
        [ -z "$branch" ] || die "--continue-branch already names the branch; drop --branch"
        branch="$continue_branch"
    fi
    source_repo="$(repo_path "$repo")"
    [ -d "$source_repo/.git" ] || die "repository '$repo' is not configured"

    [ -n "$name" ] || name="$(slugify "$task")"
    [ -n "$name" ] || die "could not derive a workspace name from the task"
    [ -n "$branch" ] || branch="notis/$name"
    # Every branch this tool creates carries the notis/ prefix, including one
    # named with --branch. The prefix is how someone reading `git branch -r`
    # tells this tool's work from their own, and an override that opted out of
    # it made that unreadable. Stripping first keeps it idempotent, so passing
    # `--branch notis/x` does not produce `notis/notis/x`.
    #
    # --continue-branch is exempt: it adopts a branch that already exists on the
    # remote, which another tool or a person may well have named.
    [ -n "$continue_branch" ] || branch="notis/${branch#notis/}"
    validate_segment "workspace name" "$name"
    validate_ref "branch" "$branch"

    target="$(tree_path "$repo" "$name")"
    [ -e "$target" ] && die "workspace already exists at $target"

    git -C "$source_repo" fetch --quiet origin

    if [ -n "$continue_branch" ]; then
        git -C "$source_repo" fetch --quiet origin "$branch" \
            || die "branch '$branch' is not on origin -- push it before handing the work over"
        # git refuses the same branch in two worktrees, but its own error names
        # neither the holder nor the way out. The canonical checkout counts: it
        # sits on the default branch, so continuing the default branch lands
        # here rather than on an obscure git message.
        # $0 minus the prefix, not $2: a worktree path may contain spaces.
        holder="$(git -C "$source_repo" worktree list --porcelain \
            | awk -v ref="refs/heads/$branch" \
                  '/^worktree /{p=substr($0,10)} $0=="branch "ref{print p}')"
        [ -z "$holder" ] \
            || die "branch '$branch' is already checked out at $holder -- work in that workspace, or start beside it with --base $branch"
        base_label="$branch (continuing)"
        continue_mode=1
    elif [ -n "$pr" ]; then
        [[ "$pr" =~ ^[1-9][0-9]*$ ]] || die "invalid pull request number: $pr"
        # Branch from the pull request head so the workspace continues that
        # work rather than starting beside it.
        start_ref="notis-pr-$pr"
        git -C "$source_repo" fetch --quiet origin "pull/$pr/head:$start_ref" --force
        base_label="pull request #$pr"
    else
        [ -n "$base" ] || base="$(default_branch_for "$repo")"
        validate_ref "base reference" "$base"
        start_ref="origin/$base"
        base_label="$base"
    fi

    mkdir -p "$(dirname "$target")"
    # Armed before the worktree exists, not after: continue mode can fail
    # between `worktree add` and the row write (a diverged local branch), and a
    # trap installed after that point would leave the tree behind -- which then
    # fails every retry with "workspace already exists".
    row_committed=0
    rollback_new_workspace() {
        if [ "$row_committed" -eq 0 ]; then
            git -C "$source_repo" worktree remove --force "$target" >/dev/null 2>&1 || true
            # Only a branch this invocation created is safe to delete. In
            # continue mode the branch is the user's own work, and it survives
            # a failed workspace exactly as it survives `remove`.
            [ -n "${continue_mode:-}" ] \
                || git -C "$source_repo" branch -D "$branch" >/dev/null 2>&1 || true
        fi
    }
    trap rollback_new_workspace EXIT

    if [ -n "${continue_mode:-}" ]; then
        if git -C "$source_repo" show-ref --verify --quiet "refs/heads/$branch"; then
            # A local branch of the same name is left from an earlier workspace.
            # Fast-forward only: a diverged local branch holds sandbox commits
            # that resetting would silently drop.
            git -C "$source_repo" worktree add "$target" "$branch"
            git -C "$target" merge --ff-only "origin/$branch" \
                || die "local '$branch' has diverged from origin/$branch -- reconcile it in the sandbox before continuing"
        else
            git -C "$source_repo" worktree add --track -b "$branch" "$target" "origin/$branch"
        fi
    else
        git -C "$source_repo" worktree add -b "$branch" "$target" "$start_ref"
    fi

    # Runtime records are workspace-private artifacts, including for repositories
    # which have not added .context to their own ignore rules yet.
    exclude="$(git -C "$target" rev-parse --path-format=absolute --git-path info/exclude)"
    mkdir -p "$(dirname "$exclude")"
    grep -qxF '/.context/' "$exclude" 2>/dev/null || printf '\n/.context/\n' >> "$exclude"
    if [ -d "$STATE_ROOT/secrets/$repo" ]; then
        $REPO secrets-apply "$repo" "$target"
    else
        echo "warning: no secrets staged for $repo" >&2
    fi

    repo_row="$($ROWS get repositories --name "$repo" \
        | python3 -c 'import json,sys; print((json.load(sys.stdin) or {}).get("document_id") or "")')"
    [ -n "$repo_row" ] || die "repository '$repo' has no database row"

    $ROWS set workspaces --name "$name" \
        --match-json-field "Repository=[\"$repo_row\"]" \
        --field "Branch=$branch" \
        --field "Base=$base_label" \
        --field "Task=$task" \
        --field "Path=$target" \
        --field "Status=Setting up" \
        --field "PR state=None" \
        --field "Last synced=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --json-field "Repository=[\"$repo_row\"]" >/dev/null
    row_committed=1
    trap - EXIT

    # Setup and preview outlive the initiating tool call. A retry of prepare
    # reuses the workspace and a running setup job instead of creating another.
    bash "$0" prepare "$repo" "$name"
    printf 'workspace=%s\nbranch=%s\nbase=%s\npath=%s\n' "$name" "$branch" "$base_label" "$target"
    ;;

prepare|preview-wait)
    action="$1"; repo="$2"; name="$3"
    validate_segment "repository slug" "$repo"
    validate_segment "workspace name" "$name"
    target="$(tree_path "$repo" "$name")"
    [ -d "$target" ] || die "no workspace at $target"
    if [ "$action" = prepare ]; then
        if ! $JOB running "preview-$repo-$name"; then
            python3 "$HERE/workspace_preview.py" reset "$repo" "$name" "$target"
            $JOB start "preview-$repo-$name" python3 "$HERE/workspace_preview.py" prepare "$repo" "$name" "$target" || {
                code=$?; [ "$code" = 3 ] || exit "$code"
            }
        fi
    fi
    python3 "$HERE/workspace_preview.py" wait "$repo" "$name" "$target"
    ;;

setup)
    repo="$2"; name="$3"
    validate_segment "repository slug" "$repo"
    validate_segment "workspace name" "$name"
    target="$(tree_path "$repo" "$name")"
    [ -d "$target" ] || die "no workspace at $target"
    setup_cmd="$(row_field "$repo" 'Setup command')"
    [ -n "$setup_cmd" ] || die "repository '$repo' has no setup command recorded"
    secrets="$STATE_ROOT/secrets/$repo"

    if [ -d "$secrets" ]; then
        $REPO secrets-apply "$repo" "$target"
    fi

    $JOB start "setup-$repo-$name" env \
        NOTIS_ENV_SOURCE_ROOT="$secrets" \
        bash -c 'cd -- "$1" && exec bash -lc "$2"' _ "$target" "$setup_cmd"
    manifest="$STATE_ROOT/manifests/$repo/$(printf '%s' "$target" | sha256 | cut -d ' ' -f1).env-files"
    if [ -d "$secrets" ]; then
        [ -s "$manifest.digest" ] || die "applied env generation proof is missing"
        cp "$manifest.digest" "$STATE_ROOT/setup-env-$repo-$name"
    else
        $REPO secrets-digest "$repo" > "$STATE_ROOT/setup-env-$repo-$name"
    fi
    ;;

sync)
    repo="$2"; name="$3"
    validate_segment "repository slug" "$repo"
    validate_segment "workspace name" "$name"
    target="$(tree_path "$repo" "$name")"
    [ -d "$target" ] || die "no workspace at $target"
    repo_row="$($ROWS get repositories --name "$repo" \
        | python3 -c 'import json,sys; print((json.load(sys.stdin) or {}).get("document_id") or "")')"
    [ -n "$repo_row" ] || die "repository '$repo' has no database row"

    branch="$(git -C "$target" branch --show-current)"
    dirty="$(git -C "$target" status --porcelain | wc -l | tr -d ' ')"
    base="$(default_branch_for "$repo")"
    git -C "$target" fetch --quiet origin || true
    # Always against the default branch, in every mode. It is tempting to
    # measure a continue-mode workspace against its own remote branch instead,
    # so the count excludes commits that predate the workspace -- but `pr` sets
    # an upstream on every workspace, so that reading silently becomes
    # "unpushed commits" and a fully pushed branch holding all the work reports
    # 0. One meaning for the whole column beats a more flattering number.
    ahead="$(git -C "$target" rev-list --count "origin/$base..HEAD" 2>/dev/null || echo 0)"

    pr_state="None"; pr_number=""; pr_url=""; checks=""; pr_lookup="ok"
    setup_job="$STATE_ROOT/jobs/setup-$repo-$name"
    secrets="$STATE_ROOT/secrets/$repo"
    manifest="$STATE_ROOT/manifests/$repo/$(printf '%s' "$target" | sha256 | cut -d ' ' -f1).env-files"
    current_digest="$($REPO secrets-digest "$repo")"
    setup_digest="$(cat "$STATE_ROOT/setup-env-$repo-$name" 2>/dev/null || true)"
    applied_digest="$(cat "$manifest.digest" 2>/dev/null || true)"
    [ -d "$secrets" ] || applied_digest="$current_digest"
    if [ -f "$setup_job/status" ]; then
        setup_code="$(cat "$setup_job/status")"
        if [ "$setup_code" = "0" ] \
           && [ -n "$current_digest" ] \
           && [ "$setup_digest" = "$current_digest" ] \
           && [ "$applied_digest" = "$current_digest" ]; then
            setup_state="ready"
        elif [ "$setup_code" = "0" ]; then
            setup_state="stale"
        else
            setup_state="failed"
        fi
    elif $JOB running "setup-$repo-$name"; then
        setup_state="running"
    else
        setup_state="not_started"
    fi
    # Run from inside the worktree with no selector: `gh pr view` resolves the
    # pull request for the checked-out branch. It has no --head flag -- that is
    # `gh pr list` -- and passing one made this fail silently on every call, so
    # a workspace with an open pull request kept reporting that it had none.
    # Keep stderr: "no pull requests found" is the only failure that means the
    # defaults above are true. Every other non-zero exit (revoked auth, rate
    # limit, network) says nothing about the PR, and writing the cleared
    # defaults then would erase a recorded pull request.
    pr_stderr="$(mktemp)"
    if pr_json="$(cd "$target" && gh pr view \
                    --json number,url,state,isDraft,statusCheckRollup 2>"$pr_stderr")"; then
        pr_number="$(printf '%s' "$pr_json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("number",""))')"
        pr_url="$(printf '%s' "$pr_json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("url",""))')"
        pr_state="$(printf '%s' "$pr_json" | python3 -c '
import json, sys
data = json.load(sys.stdin)
state = (data.get("state") or "").upper()
print("Draft" if data.get("isDraft") and state == "OPEN" else state.capitalize() or "None")
')"
        checks="$(printf '%s' "$pr_json" | python3 -c '
import json, sys
rollup = json.load(sys.stdin).get("statusCheckRollup") or []
if not rollup:
    print("no checks reported")
else:
    tally = {}
    for check in rollup:
        verdict = check.get("conclusion") or check.get("state") or "PENDING"
        tally[verdict] = tally.get(verdict, 0) + 1
    print(", ".join(f"{count} {name.lower()}" for name, count in sorted(tally.items())))
')"
    elif ! grep -qi "no pull requests found" "$pr_stderr"; then
        pr_lookup="failed: $(tr '\n' ' ' < "$pr_stderr" | cut -c1-200)"
    fi
    rm -f "$pr_stderr"

    if [ "$pr_lookup" = "ok" ]; then
        if [ "$setup_state" = "failed" ]; then
            status="Error"
        elif [ "$setup_state" != "ready" ]; then
            status="Setting up"
        else
            status="Working"
            [ "$pr_state" = "Merged" ] && status="Archived"
            [ "$dirty" = "0" ] && [ "$ahead" = "0" ] && [ "$pr_state" = "None" ] && status="Ready"
        fi

        $ROWS set workspaces --name "$name" \
            --match-json-field "Repository=[\"$repo_row\"]" \
            --field "Branch=$branch" \
            --field "Status=$status" \
            --field "PR state=$pr_state" \
            --field "PR number=${pr_number:-}" \
            --field "PR URL=${pr_url:-}" \
            --field "Checks=${checks:-}" \
            --field "Ahead=$ahead" \
            --field "Dirty files=$dirty" \
            --field "Last synced=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    else
        # The read-merge-write helper preserves any field not named, so the
        # previous Status and PR fields survive a lookup we could not perform.
        $ROWS set workspaces --name "$name" \
            --match-json-field "Repository=[\"$repo_row\"]" \
            --field "Branch=$branch" \
            --field "Ahead=$ahead" \
            --field "Dirty files=$dirty" \
            --field "Last synced=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "warning: pull request state unavailable ($pr_lookup); kept previous PR fields" >&2
    fi

    python3 "$HERE/preview_github.py" "$target" || echo "warning: preview GitHub sync failed; retry workspace sync" >&2
    printf 'branch=%s ahead=%s dirty=%s pr=%s %s\n' "$branch" "$ahead" "$dirty" "$pr_state" "$pr_url"
    ;;

pr)
    repo="$2"; name="$3"; shift 3
    validate_segment "repository slug" "$repo"
    validate_segment "workspace name" "$name"
    title=""; body=""; body_file=""; draft=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --title) title="$2"; shift 2 ;;
            --body) body="$2"; shift 2 ;;
            --body-file) body_file="$2"; shift 2 ;;
            --draft) draft="--draft"; shift ;;
            *) die "unknown option $1" ;;
        esac
    done
    [ -z "$body_file" ] || body="$(cat -- "$body_file")"
    target="$(tree_path "$repo" "$name")"
    [ -d "$target" ] || die "no workspace at $target"
    [ -n "$title" ] || die "--title is required"
    base="$(default_branch_for "$repo")"
    branch="$(git -C "$target" branch --show-current)"

    git -C "$target" push --set-upstream origin "$branch" \
        || die "push to origin/$branch was rejected -- fetch and rebase inside the workspace; never force-push a branch someone else is on"
    # A workspace continuing an existing branch may already have a pull request,
    # and `gh pr create` fails on that. Reuse it: a second pull request for one
    # branch is never the answer (see the header).
    #
    # Only an OPEN one counts. `gh pr view` with no selector also resolves a
    # merged or closed pull request for the branch, and treating that as "already
    # open" would print a stale link, create nothing, and leave `sync` reporting
    # the workspace as Archived while the new work sits there unreviewed.
    existing_url=""
    if existing_pr="$(cd "$target" && gh pr view --json url,state 2>/dev/null)"; then
        existing_url="$(printf '%s' "$existing_pr" | python3 -c '
import json, sys
data = json.load(sys.stdin)
print(data.get("url", "") if (data.get("state") or "").upper() == "OPEN" else "")
')"
    fi
    if [ -n "$existing_url" ]; then
        printf 'pull request already open: %s\n' "$existing_url"
    else
        # shellcheck disable=SC2086
        pr_body="$(mktemp)"
        printf '%s' "${body:-Opened from a Notis workspace.}" > "$pr_body"
        python3 "$HERE/preview_github.py" "$target" --body-file "$pr_body"
        (cd "$target" && gh pr create --base "$base" --head "$branch" \
            --title "$title" --body-file "$pr_body" $draft)
        rm -f "$pr_body"
    fi

    bash "$0" sync "$repo" "$name"
    ;;

list)
    repo="${2:-}"
    [ -z "$repo" ] || validate_segment "repository slug" "$repo"
    if [ -n "$repo" ]; then
        ls -1 "$(dirname "$(tree_path "$repo" x)")" 2>/dev/null || echo "(none)"
    else
        find "$TREES_ROOT" -mindepth 2 -maxdepth 2 -type d 2>/dev/null | sed "s|^$TREES_ROOT/||" || echo "(none)"
    fi
    ;;

remove)
    repo="$2"; name="$3"
    validate_segment "repository slug" "$repo"
    validate_segment "workspace name" "$name"
    target="$(tree_path "$repo" "$name")"
    source_repo="$(repo_path "$repo")"
    [ -d "$target" ] || die "no workspace at $target"
    repo_row="$($ROWS get repositories --name "$repo" \
        | python3 -c 'import json,sys; print((json.load(sys.stdin) or {}).get("document_id") or "")')"
    [ -n "$repo_row" ] || die "repository '$repo' has no database row"
    # Leave the branch alone: it may already be pushed and reviewed. Only the
    # local tree goes.
    git -C "$source_repo" worktree remove --force "$target"
    $ROWS set workspaces --name "$name" \
        --match-json-field "Repository=[\"$repo_row\"]" \
        --field "Status=Archived" >/dev/null
    echo "removed $target (branch kept)"
    ;;

*)
    sed -n '3,28p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
