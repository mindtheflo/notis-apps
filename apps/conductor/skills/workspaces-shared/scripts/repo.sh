#!/usr/bin/env bash
#
# Operations on a repository configured for Conductor.
#
# Layout this owns, all inside the cloud computer:
#
#   /vercel/sandbox/repositories/<slug>            the canonical checkout
#   /vercel/sandbox/workspaces/<slug>/<name>       worktrees, one per task
#   /vercel/sandbox/.notis/workspaces/secrets/...  env files, never in git
#   /vercel/sandbox/.notis/workspaces/jobs/...     detached job logs
#
# Secrets live outside every checkout on purpose. A worktree is a real
# directory under the repository's own ignore rules, and a stray `git add -A`
# in one of them would otherwise be one command away from committing an env
# file. Keeping the only copy outside the tree makes that impossible rather
# than merely discouraged.
#
#   repo.sh clone <git-url> [--slug NAME]     start a detached clone
#   repo.sh register <slug>                   record the repository row
#   repo.sh prereqs <slug>                    install interpreters the repo needs
#   repo.sh discover <slug>                   find setup/dev/archive commands
#   repo.sh secrets-install <slug> <dir>      stage env files from an upload
#   repo.sh secrets-apply <slug> <target>     copy staged env files into a tree
#   repo.sh secrets-status <slug>             what is staged, without values
#   repo.sh setup <slug>                      run the repository's setup, detached
#   repo.sh dev <slug>                        run the repository's dev command, detached
#   repo.sh verify-dev <slug> <url-or-port>   persist proof the dev job is live
#   repo.sh sync <slug>                       refresh the row from disk
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_ROOT="${NOTIS_WORKSPACES_STATE:-/vercel/sandbox/.notis/workspaces}"
REPOS_ROOT="${NOTIS_REPOS_ROOT:-/vercel/sandbox/repositories}"
TREES_ROOT="${NOTIS_TREES_ROOT:-/vercel/sandbox/workspaces}"
SECRETS_ROOT="$STATE_ROOT/secrets"
JOB="bash $HERE/job.sh"
ROWS="python3 $HERE/notis_rows.py"

mkdir -p "$REPOS_ROOT" "$TREES_ROOT"
mkdir -p "$SECRETS_ROOT"
chmod 700 "$STATE_ROOT" "$SECRETS_ROOT" 2>/dev/null || true

die() { echo "error: $*" >&2; exit 1; }

# The cloud computer is Amazon Linux, which ships coreutils' sha256sum but not
# perl's shasum; a developer Mac is the reverse. Every digest goes through this
# one name so the scripts run on both.
sha256() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}
validate_slug() {
    local value="$1"
    [[ "$value" =~ ^[a-z0-9][a-z0-9._-]{0,63}$ ]] \
        && [ "$value" != "." ] && [ "$value" != ".." ] \
        || die "invalid repository slug: $value"
}
repo_path() { printf '%s/%s' "$REPOS_ROOT" "$1"; }
secrets_path() { printf '%s/%s' "$SECRETS_ROOT" "$1"; }

SECRETS_LOCK_HELPER_PID=""
SECRETS_LOCK_READY=""

acquire_secrets_lock() {
    local slug="$1" lock="$STATE_ROOT/.secrets-$1.flock" attempt=0
    SECRETS_LOCK_READY="$(mktemp "$STATE_ROOT/.secrets-lock-ready.XXXXXX")"
    rm -f -- "$SECRETS_LOCK_READY"
    # fcntl locks belong to the helper process and are released by the kernel on
    # every exit path, including SIGKILL. The helper also notices if its shell
    # parent disappears, so a crashed secrets operation cannot wedge the next
    # one and no stale-lock deletion/ABA protocol is needed.
    python3 - "$lock" "$SECRETS_LOCK_READY" "$$" <<'PY' &
import fcntl
import os
import sys
import time

lock_path, ready_path, parent_pid = sys.argv[1], sys.argv[2], int(sys.argv[3])
with open(lock_path, "a+", encoding="utf-8") as handle:
    fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
    with open(ready_path, "w", encoding="utf-8") as ready:
        ready.write("locked\n")
    while os.getppid() == parent_pid:
        time.sleep(0.1)
PY
    SECRETS_LOCK_HELPER_PID=$!
    while [ ! -s "$SECRETS_LOCK_READY" ]; do
        kill -0 "$SECRETS_LOCK_HELPER_PID" 2>/dev/null \
            || die "secrets lock helper failed for $slug"
        attempt=$((attempt + 1))
        if [ "$attempt" -ge 100 ]; then
            kill "$SECRETS_LOCK_HELPER_PID" 2>/dev/null || true
            wait "$SECRETS_LOCK_HELPER_PID" 2>/dev/null || true
            rm -f -- "$SECRETS_LOCK_READY"
            SECRETS_LOCK_HELPER_PID=""
            SECRETS_LOCK_READY=""
            die "timed out waiting for secrets lock for $slug"
        fi
        sleep 0.1
    done
    rm -f -- "$SECRETS_LOCK_READY"
    SECRETS_LOCK_READY=""
}

release_secrets_lock() {
    if [ -n "$SECRETS_LOCK_HELPER_PID" ]; then
        kill "$SECRETS_LOCK_HELPER_PID" 2>/dev/null || true
        wait "$SECRETS_LOCK_HELPER_PID" 2>/dev/null || true
        SECRETS_LOCK_HELPER_PID=""
    fi
    [ -z "$SECRETS_LOCK_READY" ] || rm -f -- "$SECRETS_LOCK_READY"
    SECRETS_LOCK_READY=""
}

target_manifest_path() {
    local slug="$1" target="$2" digest
    digest="$(printf '%s' "$target" | sha256 | cut -d ' ' -f1)"
    printf '%s/manifests/%s/%s.env-files' "$STATE_ROOT" "$slug" "$digest"
}

assert_safe_env_destination() {
    local target="$1" relative="$2"
    python3 - "$target" "$relative" <<'PY'
import os, pathlib, sys
root = pathlib.Path(sys.argv[1]).resolve(strict=True)
relative = pathlib.PurePosixPath(sys.argv[2])
if relative.is_absolute() or '..' in relative.parts or not relative.parts:
    raise SystemExit(f"unsafe env path: {relative}")
cursor = pathlib.Path(root)
for part in relative.parts:
    cursor = cursor / part
    if cursor.is_symlink():
        raise SystemExit(f"env destination traverses symlink: {cursor}")
    if cursor.exists() and cursor != root and cursor.is_dir():
        resolved = cursor.resolve(strict=True)
        if os.path.commonpath((str(root), str(resolved))) != str(root):
            raise SystemExit(f"env destination escapes target: {cursor}")
PY
}

# The database schema ships as code before any given install's database has
# it, so the first row write of a session brings the schema up to date. Once
# per schema version: converged is one read, but not free.
ensure_schema_once() {
    local marker="$STATE_ROOT/.schema-ensured"
    local digest marker_tmp
    digest="$(sha256 "$HERE/ensure_schema.py" | cut -d ' ' -f1)"
    if [ -f "$marker" ] && [ "$(cat "$marker")" = "$digest" ]; then
        return 0
    fi
    if python3 "$HERE/ensure_schema.py"; then
        marker_tmp="$marker.tmp.$$"
        printf '%s\n' "$digest" > "$marker_tmp"
        mv "$marker_tmp" "$marker"
    else
        echo "warning: schema ensure failed; row writes may use legacy fields" >&2
    fi
}

# Env files are recognised by name, not by location: a repo can keep them at
# the root, per package, or both.
env_files_in() {
    local root="$1"
    [ -d "$root" ] || return 0
    find "$root" \
        \( -name node_modules -o -name .git -o -name .venv -o -name .next \) -prune -o \
        -type f \( -name '.env' -o -name '.env.*' -o -name '*.env' \) -print 2>/dev/null \
        | sed "s|^$root/||" | sort
}

slug_from_url() {
    basename "$1" .git | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g'
}

# The row's `Environment files` property is of the platform's `secret` kind: it
# stores a pointer and nothing else -- a reference, a status and a metadata
# object -- and the read path redacts even that. Names of files and the
# directory they live in are metadata about credentials, not credentials, so
# they travel; the contents have no field to travel in, which turns "never put
# a value in the database" from an instruction into a property of the storage.
#
# Reads the file names on stdin, one per line.
env_secret() {
    python3 -c '
import json, sys

files = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
print(json.dumps({
    "reference": sys.argv[1],
    "status": sys.argv[2],
    "metadata": {"files": files},
}))
' "$1" "$2"
}

# Staged means "there is something here now". Verified is stronger and only
# `sync` may award it: it means setup succeeded with these files in place.
staged_state() {
    if [ -d "$1" ] && [ -n "$(env_files_in "$1")" ]; then echo "Staged"; else echo "Missing"; fi
}

env_set_digest() {
    local root="$1"
    env_files_in "$root" | while IFS= read -r relative; do
        [ -n "$relative" ] || continue
        printf '%s\0' "$relative"
        sha256 "$root/$relative" | cut -d ' ' -f1
    done | sha256 | cut -d ' ' -f1
}

case "${1:-}" in

clone)
    url="$2"; shift 2
    slug=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --slug) slug="$2"; shift 2 ;;
            *) die "unknown option $1" ;;
        esac
    done
    [ -n "$slug" ] || slug="$(slug_from_url "$url")"
    validate_slug "$slug"
    dest="$(repo_path "$slug")"

    if [ -d "$dest/.git" ]; then
        echo "already cloned: $dest"
        git -C "$dest" remote set-url origin "$url"
        exit 0
    fi
    # Detached: a large repository is minutes of work and the caller's shell
    # has a hard ceiling.
    $JOB start "clone-$slug" git clone "$url" "$dest"
    echo "slug=$slug path=$dest"
    ;;

register)
    slug="$2"
    validate_slug "$slug"
    dest="$(repo_path "$slug")"
    [ -d "$dest/.git" ] || die "no checkout at $dest -- clone first"
    ensure_schema_once

    url="$(git -C "$dest" remote get-url origin)"
    # Normalise to the https form so the row is a link a person can open.
    # A clone URL may carry HTTP userinfo; git needs it for the clone, but the
    # database and app link must never persist that credential.
    https_url="$(python3 - "$url" <<'PY'
import re
import sys
from urllib.parse import urlsplit

raw = sys.argv[1].strip()
scp = re.fullmatch(r"git@github\.com:(.+)", raw, flags=re.IGNORECASE)
if scp:
    path = scp.group(1)
else:
    parsed = urlsplit(raw)
    if parsed.scheme.lower() not in {"http", "https", "ssh"}:
        raise SystemExit("unsupported origin scheme")
    if (parsed.hostname or "").lower() != "github.com":
        raise SystemExit("origin is not hosted on github.com")
    path = parsed.path.lstrip("/")
parts = path.removesuffix(".git").split("/")
if len(parts) != 2 or not all(re.fullmatch(r"[A-Za-z0-9_.-]+", part) for part in parts):
    raise SystemExit("origin is not an owner/repository GitHub URL")
print(f"https://github.com/{parts[0]}/{parts[1]}.git")
PY
)" || die "origin is not a supported GitHub repository URL"
    owner="$(printf '%s' "$https_url" | sed -E 's|.*github.com/([^/]+)/.*|\1|')"
    # No lazy quantifiers in POSIX ERE (BSD sed rejects `+?` outright, GNU sed
    # stays greedy), so strip the `.git` suffix in a second, plain step.
    name="$(printf '%s' "$https_url" | sed -E 's|.*github.com/[^/]+/([^/]+)$|\1|; s|\.git$||')"

    branch="$(git -C "$dest" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null \
        | sed 's|^origin/||' || true)"
    [ -n "$branch" ] || branch="$(git -C "$dest" branch --show-current)"

    secrets="$(secrets_path "$slug")"
    $ROWS set repositories --name "$slug" \
        --field "Git URL=$https_url" \
        --field "Owner=$owner" \
        --field "Repo=$name" \
        --field "Default branch=$branch" \
        --field "Path=$dest" \
        --json-field "Environment files=$(env_files_in "$secrets" \
            | env_secret "$secrets" "$(staged_state "$secrets")")" \
        --field "Status=Configuring"
    ;;

prereqs)
    slug="$2"
    validate_slug "$slug"
    dest="$(repo_path "$slug")"
    [ -d "$dest" ] || die "no checkout at $dest"

    # Install only what the repository's own scripts ask for. Reading the
    # required interpreter out of the bootstrap script beats guessing, and the
    # sandbox image is deliberately minimal: it ships Python 3.9 while many
    # projects pin something newer.
    wanted="$(grep -rhoE 'python3\.[0-9]+' "$dest"/*.sh "$dest"/scripts/*.sh 2>/dev/null | sort -u || true)"
    for interpreter in $wanted; do
        if command -v "$interpreter" >/dev/null 2>&1; then
            echo "$interpreter: present"
            continue
        fi
        echo "$interpreter: installing"
        sudo dnf install -y "$interpreter" "$interpreter-devel" >/dev/null 2>&1 \
            || sudo dnf install -y "$interpreter" >/dev/null 2>&1 \
            || die "could not install $interpreter"
        command -v "$interpreter" >/dev/null 2>&1 || die "$interpreter still missing after install"
        echo "$interpreter: installed"
    done
    command -v node >/dev/null 2>&1 || die "node is missing from the image"
    echo "node: $(node --version)"
    ;;

discover)
    slug="$2"
    validate_slug "$slug"
    dest="$(repo_path "$slug")"
    [ -d "$dest" ] || die "no checkout at $dest"

    pick() {
        for candidate in "$@"; do
            if [ -f "$dest/$candidate" ]; then printf './%s' "$candidate"; return 0; fi
        done
        return 1
    }
    setup_cmd="$(pick install.sh setup.sh bootstrap.sh scripts/setup.sh scripts/install.sh || true)"
    dev_cmd="$(pick dev.sh scripts/dev.sh start.sh || true)"
    archive_cmd="$(pick archive.sh scripts/archive.sh || true)"

    # Fall back to the package manager only when the repository has no script
    # of its own; never overwrite one that exists.
    if [ -z "$setup_cmd" ] && [ -f "$dest/package.json" ]; then setup_cmd="npm install"; fi
    if [ -z "$dev_cmd" ] && [ -f "$dest/package.json" ]; then dev_cmd="npm run dev"; fi

    printf 'setup=%s\ndev=%s\narchive=%s\n' "${setup_cmd:-}" "${dev_cmd:-}" "${archive_cmd:-}"

    $ROWS set repositories --name "$slug" \
        --field "Setup command=${setup_cmd:-}" \
        --field "Dev command=${dev_cmd:-}" \
        --field "Archive command=${archive_cmd:-}" >/dev/null
    ;;

secrets-install)
    slug="$2"; source_dir="$3"
    validate_slug "$slug"
    [ -d "$source_dir" ] || die "no such upload directory: $source_dir"
    ensure_schema_once
    target="$(secrets_path "$slug")"
    candidate=""; listing=""
    backup="$STATE_ROOT/.secrets-$slug.backup.$$"
    published=0
    swapped=0
    cleanup_install() {
        [ -z "$listing" ] || rm -f -- "$listing"
        [ -z "$candidate" ] || [ ! -d "$candidate" ] || rm -rf -- "$candidate"
        if [ "$published" -eq 0 ] && [ "$swapped" -eq 1 ]; then
            [ ! -e "$target" ] || rm -rf -- "$target"
            [ ! -e "$backup" ] || mv "$backup" "$target" 2>/dev/null || true
        fi
        [ ! -e "$backup" ] || rm -rf -- "$backup"
        release_secrets_lock
    }
    trap cleanup_install EXIT
    acquire_secrets_lock "$slug"
    candidate="$(mktemp -d "$STATE_ROOT/.secrets-$slug.XXXXXX")"
    listing="$(mktemp)"
    env_files_in "$source_dir" > "$listing"
    count=0
    while IFS= read -r relative; do
        [ -n "$relative" ] || continue
        mkdir -p "$candidate/$(dirname "$relative")"
        cp "$source_dir/$relative" "$candidate/$relative"
        chmod 600 "$candidate/$relative"
        count=$((count + 1))
    done < "$listing"

    [ "$count" -gt 0 ] || die "no env files found under $source_dir"
    chmod 700 "$candidate"

    # Replace the set as one operation. Uploading A+B followed by A must remove
    # B, while an interrupted copy must leave the previous complete set intact.
    swapped=1
    if [ -e "$target" ]; then mv "$target" "$backup"; fi
    if ! mv "$candidate" "$target"; then
        [ ! -e "$backup" ] || mv "$backup" "$target"
        die "could not replace staged env files for $slug"
    fi
    files="$(env_files_in "$target")"

    $ROWS set repositories --name "$slug" \
        --json-field "Environment files=$(printf '%s\n' "$files" \
            | env_secret "$target" Staged)" \
        --field "Status=Configuring" \
        --field "Setup verified at=" >/dev/null
    published=1
    [ ! -e "$backup" ] || rm -rf -- "$backup"
    for jobdir in "$STATE_ROOT/jobs/setup-$slug" "$STATE_ROOT/jobs/setup-$slug-"*; do
        [ -d "$jobdir" ] || continue
        $JOB stop "$(basename "$jobdir")" >/dev/null 2>&1 || true
        rm -f -- "$jobdir/status" "$jobdir/finished_at"
    done
    rm -f -- "$STATE_ROOT/jobs/setup-$slug/status" \
        "$STATE_ROOT/jobs/setup-$slug/finished_at" \
        "$STATE_ROOT/setup-env-$slug" "$STATE_ROOT/setup-env-$slug-"* \
        "$STATE_ROOT/dev-verified-$slug"
    echo "staged $count file(s) into $target"
    printf '%s\n' "$files"
    trap - EXIT
    cleanup_install
    ;;

secrets-apply)
    slug="$2"; target="$3"
    validate_slug "$slug"
    source_dir="$(secrets_path "$slug")"
    [ -d "$source_dir" ] || die "nothing staged for $slug"
    [ -d "$target" ] || die "no such target: $target"

    listing="$(mktemp)"
    previous="$(mktemp)"
    union="$(mktemp)"
    candidate="$(mktemp -d "$STATE_ROOT/.apply-$slug.XXXXXX")"
    backup="$(mktemp -d "$STATE_ROOT/.apply-backup-$slug.XXXXXX")"
    absent="$backup/.absent"
    manifest="$(target_manifest_path "$slug" "$target")"
    cleanup_apply_lock() {
        release_secrets_lock
    }
    applied=0
    mutations_started=0
    rollback_apply() {
        if [ "$applied" -eq 0 ] && [ "$mutations_started" -eq 1 ]; then
            while IFS= read -r relative; do
                [ -n "$relative" ] || continue
                rm -f -- "$target/$relative"
                rm -f -- "$target/$relative.tmp.$$"
                if [ -f "$backup/$relative" ]; then
                    mkdir -p "$target/$(dirname "$relative")"
                    cp "$backup/$relative" "$target/$relative" 2>/dev/null || true
                fi
            done < "$union"
        fi
        rm -f -- "$listing" "$previous" "$union"
        rm -rf -- "$candidate" "$backup"
        cleanup_apply_lock
    }
    acquire_secrets_lock "$slug"
    trap rollback_apply EXIT
    env_files_in "$source_dir" > "$listing"
    [ ! -f "$manifest" ] || cp "$manifest" "$previous"
    cat "$listing" "$previous" | sed '/^$/d' | sort -u > "$union"

    # Prepare every replacement and every rollback byte before touching the
    # checkout. The target may be a worktree, so replacing the whole directory
    # is not an option; the managed file set is the transaction boundary.
    while IFS= read -r relative; do
        [ -n "$relative" ] || continue
        mkdir -p "$candidate/$(dirname "$relative")"
        cp "$source_dir/$relative" "$candidate/$relative"
        chmod 600 "$candidate/$relative"
    done < "$listing"
    while IFS= read -r relative; do
        [ -n "$relative" ] || continue
        assert_safe_env_destination "$target" "$relative"
        if [ -f "$target/$relative" ]; then
            mkdir -p "$backup/$(dirname "$relative")"
            cp "$target/$relative" "$backup/$relative"
        else
            printf '%s\n' "$relative" >> "$absent"
        fi
    done < "$union"

    mutations_started=1
    while IFS= read -r relative; do
        [ -n "$relative" ] || continue
        assert_safe_env_destination "$target" "$relative"
        grep -qxF "$relative" "$listing" 2>/dev/null && continue
        rm -f -- "$target/$relative"
    done < "$previous"
    while IFS= read -r relative; do
        [ -n "$relative" ] || continue
        assert_safe_env_destination "$target" "$relative"
        mkdir -p "$target/$(dirname "$relative")"
        assert_safe_env_destination "$target" "$relative"
        cp "$candidate/$relative" "$target/$relative.tmp.$$"
        chmod 600 "$target/$relative.tmp.$$"
        mv "$target/$relative.tmp.$$" "$target/$relative"
    done < "$listing"

    # A repository that does not already ignore its env files would show every
    # one of them as untracked in the new tree, which is one careless
    # `git add -A` away from committing a secret. info/exclude is per-checkout
    # and is itself never committed, so this holds even for repositories whose
    # .gitignore we do not control.
    # --git-common-dir, not --absolute-git-dir: in a worktree the latter points
    # at .git/worktrees/<name>, and git reads info/exclude from the common
    # directory. Writing to the per-worktree path leaves the file ignored by
    # everything, including git.
    if git_dir="$(cd "$target" && git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"; then
        mkdir -p "$git_dir/info"
        while IFS= read -r relative; do
            [ -n "$relative" ] || continue
            grep -qxF "/$relative" "$git_dir/info/exclude" 2>/dev/null && continue
            printf '/%s\n' "$relative" >> "$git_dir/info/exclude"
        done < "$listing"
    fi
    mkdir -p "$(dirname "$manifest")"
    cp "$listing" "$manifest.tmp.$$"
    mv "$manifest.tmp.$$" "$manifest"
    env_set_digest "$source_dir" > "$manifest.digest.tmp.$$"
    mv "$manifest.digest.tmp.$$" "$manifest.digest"
    applied=1
    count="$(wc -l < "$listing" | tr -d ' ')"
    trap - EXIT
    rollback_apply
    echo "applied $count env file(s) to $target"
    ;;

secrets-status)
    slug="$2"
    validate_slug "$slug"
    target="$(secrets_path "$slug")"
    if [ ! -d "$target" ]; then echo "missing"; exit 0; fi
    # Names and sizes only. The values are the whole point of keeping this
    # directory out of the database and out of any agent transcript.
    echo "staged at $target"
    listing="$(mktemp)"
    env_files_in "$target" > "$listing"
    while IFS= read -r relative; do
        [ -n "$relative" ] || continue
        printf '  %-40s %6s bytes\n' "$relative" "$(wc -c < "$target/$relative")"
    done < "$listing"
    rm -f "$listing"
    ;;

secrets-digest)
    slug="$2"
    validate_slug "$slug"
    env_set_digest "$(secrets_path "$slug")"
    ;;

setup)
    slug="$2"
    validate_slug "$slug"
    dest="$(repo_path "$slug")"
    [ -d "$dest" ] || die "no checkout at $dest"
    secrets="$(secrets_path "$slug")"

    setup_cmd="$($ROWS get repositories --name "$slug" \
        | python3 -c 'import json,sys; print((json.load(sys.stdin) or {}).get("Setup command") or "")')"
    [ -n "$setup_cmd" ] || die "no setup command recorded -- run discover first"

    if [ -d "$secrets" ]; then
        bash "$0" secrets-apply "$slug" "$dest"
    else
        echo "warning: no secrets staged for $slug" >&2
    fi
    # NOTIS_ENV_SOURCE_ROOT is honoured by repositories that provision their own
    # env files; harmless for those that do not.
    $JOB start "setup-$slug" env \
        NOTIS_ENV_SOURCE_ROOT="$secrets" \
        bash -c 'cd -- "$1" && exec bash -lc "$2"' _ "$dest" "$setup_cmd"
    manifest="$(target_manifest_path "$slug" "$dest")"
    if [ -d "$secrets" ]; then
        [ -s "$manifest.digest" ] || die "applied env generation proof is missing"
        cp "$manifest.digest" "$STATE_ROOT/setup-env-$slug"
    else
        env_set_digest "$secrets" > "$STATE_ROOT/setup-env-$slug"
    fi
    $ROWS set repositories --name "$slug" --field "Status=Configuring" >/dev/null
    ;;

dev)
    slug="$2"
    validate_slug "$slug"
    dest="$(repo_path "$slug")"
    [ -d "$dest" ] || die "no checkout at $dest"
    dev_cmd="$($ROWS get repositories --name "$slug" \
        | python3 -c 'import json,sys; print((json.load(sys.stdin) or {}).get("Dev command") or "")')"
    [ -n "$dev_cmd" ] || die "no dev command recorded -- run discover first"
    rm -f -- "$STATE_ROOT/dev-verified-$slug"
    $JOB start "dev-$slug" bash -c 'cd -- "$1" && exec bash -lc "$2"' _ "$dest" "$dev_cmd"
    $ROWS set repositories --name "$slug" --field "Status=Configuring" >/dev/null
    ;;

verify-dev)
    slug="$2"; evidence="$3"
    validate_slug "$slug"
    [[ "$evidence" =~ ^https?://[^[:space:]]+$ || "$evidence" =~ ^[0-9]{2,5}$ ]] \
        || die "dev proof must be a URL or port"
    dev_job="$STATE_ROOT/jobs/dev-$slug"
    $JOB running "dev-$slug" || die "dev job is not running"
    [ -s "$dev_job/log" ] || die "dev job has no startup log"
    if [[ "$evidence" =~ ^https?:// ]]; then
        curl -fsS --max-time 5 "$evidence" >/dev/null \
            || die "dev URL is not reachable: $evidence"
    else
        python3 -c 'import socket,sys; socket.create_connection(("127.0.0.1", int(sys.argv[1])), 5).close()' \
            "$evidence" || die "dev port is not reachable: $evidence"
    fi
    digest="$(env_set_digest "$(secrets_path "$slug")")"
    printf '%s\n%s\n%s\n' "$digest" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$evidence" \
        > "$STATE_ROOT/dev-verified-$slug"
    echo "verified dev readiness at $evidence"
    ;;

sync)
    slug="$2"
    validate_slug "$slug"
    dest="$(repo_path "$slug")"
    [ -d "$dest/.git" ] || die "no checkout at $dest"
    ensure_schema_once
    secrets="$(secrets_path "$slug")"

    secrets_state="$(staged_state "$secrets")"
    setup_job="$STATE_ROOT/jobs/setup-$slug"
    verified_at=""
    dev_proof="$STATE_ROOT/dev-verified-$slug"
    current_digest="$(env_set_digest "$secrets")"
    setup_digest="$(cat "$STATE_ROOT/setup-env-$slug" 2>/dev/null || true)"
    dev_digest="$(head -n 1 "$dev_proof" 2>/dev/null || true)"
    if [ -f "$setup_job/status" ] \
       && [ "$(cat "$setup_job/status")" = "0" ] \
       && [ -n "$current_digest" ] \
       && [ "$setup_digest" = "$current_digest" ] \
       && [ "$dev_digest" = "$current_digest" ]; then
        status="Ready"
        # Verified means "setup succeeded WITH these staged files". A repository
        # with nothing staged (or whose files were deleted since) keeps the
        # state computed from disk; a green badge next to "no files" is a lie.
        [ "$secrets_state" = "Staged" ] && secrets_state="Verified"
        if [ -s "$setup_job/finished_at" ]; then
            verified_at="$(cat "$setup_job/finished_at")"
        fi
    else
        status="Configuring"
    fi

    write_sync_row() {
        $ROWS set repositories --name "$slug" \
            --field "Status=$status" \
            --json-field "Environment files=$(env_files_in "$secrets" \
                | env_secret "$secrets" "$secrets_state")" \
            "$@"
    }
    if [ -n "$verified_at" ]; then
        write_sync_row --field "Setup verified at=$verified_at"
    else
        write_sync_row
    fi
    ;;

*)
    sed -n '3,30p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
