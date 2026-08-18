#!/usr/bin/env bash
#
# Run a long command detached, and let a later shell ask how it went.
#
# Sandbox commands are killed at twelve minutes. Installing a repository's
# dependencies is routinely longer than that on two vCPUs, and an agent turn can
# end while it is still running. A foreground run would therefore leave a
# half-installed tree with nothing to inspect. Everything slow goes through
# here instead: the work is detached from the calling shell, its output is
# appended to one log, and its exit code is written to a status file the moment
# it finishes.
#
#   job.sh running <name>              exit 0 only for this job's live process
#   job.sh start <name> <command...>   start (or refuse to restart a live job)
#   job.sh status <name>               running | exit code, plus elapsed time
#   job.sh log <name> [lines]          tail the log
#   job.sh wait <name> [seconds]       block until it finishes or the budget runs out
#   job.sh stop <name>                 terminate a live detached job
#   job.sh list                        every job and its state
set -euo pipefail

STATE_ROOT="${NOTIS_WORKSPACES_STATE:-/vercel/sandbox/.notis/workspaces}"
JOBS_ROOT="$STATE_ROOT/jobs"

job_dir() { printf '%s/%s' "$JOBS_ROOT" "$1"; }
validate_job_name() {
    local value="$1"
    [[ "$value" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] \
        && [ "$value" != "." ] && [ "$value" != ".." ] \
        || { echo "error: invalid job name: $value" >&2; exit 1; }
}

run_with_job_lock() {
    local dir="$1" action="$2" name="$3"
    shift 3
    local lock_root="$JOBS_ROOT/.locks"
    mkdir -p "$lock_root"
    # The parent Python process owns an fcntl lock while the inner action runs.
    # Kernel locks are atomic and disappear on every exit path without trusting
    # a PID file that may outlive its process.
    exec python3 - "$lock_root/$name.lock" "$dir" "$0" "$action" "$name" "$@" <<'PY'
import fcntl
import os
import subprocess
import sys

lock_path, job_dir, script, action, name, *arguments = sys.argv[1:]
with open(lock_path, "a", encoding="utf-8") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    env = dict(os.environ)
    env["NOTIS_JOB_STATE_LOCKED"] = job_dir
    raise SystemExit(
        subprocess.run(["bash", script, action, name, *arguments], env=env).returncode
    )
PY
}

is_running() {
    local dir="$1"
    local pid token command
    [ ! -f "$dir/status" ] || return 1
    [ -f "$dir/pid" ] || return 1
    pid="$(cat "$dir/pid")"
    [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
    kill -0 "$pid" 2>/dev/null || return 1
    # procps may truncate `ps -o command=` to the terminal width when stdout is
    # captured. Prefer the kernel's complete argv on Linux, with wide `ps` as
    # the portable fallback used by local macOS development.
    if [ -r "/proc/$pid/cmdline" ]; then
        command="$(tr '\0' '\n' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    else
        command="$(ps -ww -p "$pid" -o command= 2>/dev/null || true)"
    fi
    if [ -f "$dir/owner" ]; then
        token="$(cat "$dir/owner")"
        [[ "$token" =~ ^[a-f0-9]{32}$ ]] || return 1
        [[ "$command" == *"notis-job:$token"* ]]
        return
    fi
    # Jobs started by the first app release predate owner tokens. Their wrapper
    # command still contains all three job-specific output paths, which is
    # enough to adopt a live legacy job without trusting a recycled PID alone.
    [[ "$command" == *"$dir/log"* \
        && "$command" == *"$dir/status"* \
        && "$command" == *"$dir/finished_at"* ]]
}

case "${1:-}" in
running)
    name="$2"
    validate_job_name "$name"
    is_running "$(job_dir "$name")"
    ;;

start)
    name="$2"; shift 2
    validate_job_name "$name"
    dir="$(job_dir "$name")"
    mkdir -p "$dir"
    if [ "${NOTIS_JOB_STATE_LOCKED:-}" != "$dir" ]; then
        run_with_job_lock "$dir" start "$name" "$@"
    fi
    unset NOTIS_JOB_STATE_LOCKED
    if is_running "$dir"; then
        echo "job '$name' is already running (pid $(cat "$dir/pid"))" >&2
        exit 3
    fi
    rm -f "$dir/status" "$dir/pid" "$dir/owner"
    : > "$dir/log"
    printf '%s\n' "$*" > "$dir/command"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$dir/started_at"
    token="$(python3 -c 'import secrets; print(secrets.token_hex(16))')"
    printf '%s\n' "$token" > "$dir/owner"

    # setsid detaches from this shell's process group, so the sandbox reaping
    # the command that started the job does not take the job down with it.
    setsid bash -c '
        set -o pipefail
        "$@" >> "'"$dir"'/log" 2>&1
        code=$?
        printf "%s\n" "$code" > "'"$dir"'/status"
        date -u +%Y-%m-%dT%H:%M:%SZ > "'"$dir"'/finished_at"
        exit $code
    ' "notis-job:$token" "$@" < /dev/null >> "$dir/log" 2>&1 &

    echo $! > "$dir/pid"
    echo "started job '$name' (pid $(cat "$dir/pid")), log $dir/log"
    ;;

status)
    name="$2"
    validate_job_name "$name"
    dir="$(job_dir "$name")"
    if [ ! -d "$dir" ]; then echo "unknown"; exit 0; fi
    started="$(cat "$dir/started_at" 2>/dev/null || echo unknown)"
    if [ -f "$dir/status" ]; then
        code="$(cat "$dir/status")"
        if [ "$code" = "0" ]; then echo "done started=$started"; else echo "failed exit=$code started=$started"; fi
    elif is_running "$dir"; then
        echo "running pid=$(cat "$dir/pid") started=$started"
    else
        # No status file and no live process: the job was killed rather than
        # finishing. Say so instead of reporting it as still running forever.
        echo "abandoned started=$started"
    fi
    ;;

log)
    name="$2"; lines="${3:-60}"
    validate_job_name "$name"
    [[ "$lines" =~ ^[1-9][0-9]*$ ]] || { echo "error: invalid line count" >&2; exit 1; }
    tail -n "$lines" "$(job_dir "$name")/log" 2>/dev/null || echo "(no log yet)"
    ;;

wait)
    name="$2"; budget="${3:-540}"
    validate_job_name "$name"
    [[ "$budget" =~ ^[1-9][0-9]*$ ]] || { echo "error: invalid wait budget" >&2; exit 1; }
    dir="$(job_dir "$name")"
    waited=0
    while [ "$waited" -lt "$budget" ]; do
        if [ -f "$dir/status" ]; then
            code="$(cat "$dir/status")"
            echo "finished exit=$code after ${waited}s"
            exit "$code"
        fi
        if ! is_running "$dir" && [ ! -f "$dir/status" ] && [ "$waited" -gt 5 ]; then
            echo "abandoned after ${waited}s"; exit 4
        fi
        sleep 5; waited=$((waited + 5))
    done
    echo "still running after ${waited}s"
    exit 2
    ;;

stop)
    name="$2"
    validate_job_name "$name"
    dir="$(job_dir "$name")"
    if [ "${NOTIS_JOB_STATE_LOCKED:-}" != "$dir" ]; then
        run_with_job_lock "$dir" stop "$name"
    fi
    unset NOTIS_JOB_STATE_LOCKED
    if ! is_running "$dir"; then echo "job '$name' is not running"; exit 0; fi
    pid="$(cat "$dir/pid")"
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
        kill -0 -- "-$pid" 2>/dev/null || break
        sleep 0.2
    done
    # The wrapper may exit before a TERM-resistant child. The process group
    # cannot be reused while any such child remains, and ownership was checked
    # immediately above before TERM was sent, so finish stopping that same
    # group even after the wrapper itself has gone away.
    if kill -0 -- "-$pid" 2>/dev/null; then
        kill -9 -- "-$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    fi
    printf '%s\n' 143 > "$dir/status"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$dir/finished_at"
    echo "stopped job '$name'"
    ;;

list)
    [ -d "$JOBS_ROOT" ] || { echo "(no jobs)"; exit 0; }
    for dir in "$JOBS_ROOT"/*/; do
        [ -d "$dir" ] || continue
        printf '%-32s %s\n' "$(basename "$dir")" "$("$0" status "$(basename "$dir")")"
    done
    ;;

*)
    sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
