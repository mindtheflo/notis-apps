#!/usr/bin/env bash
#
# Put an image or a video on a GitHub pull request, and print the URL to embed.
#
# A screenshot is only evidence if the reviewer can see it without leaving the
# pull request. Committing it into the branch inflates the repository forever
# for something that is read once, and a raw link to any host GitHub does not
# own is stripped or proxied. The supported destination is GitHub's own
# attachment store -- the same place a file dragged into a comment box goes --
# which inherits the repository's visibility: on a private repository the URL
# 404s for anyone who is not a collaborator.
#
# The endpoint is undocumented but stable, and it is the only one that exists;
# there is no `gh` subcommand for it. A Bearer token works, so this runs
# headless.
#
#   attach.sh <file> [owner/repo]     upload, print the asset URL
#
# The repository defaults to the `origin` remote of the file's own directory,
# which is what you want inside a workspace.
#
# HTML is deliberately refused. GitHub rejects text/html, and so does Supabase
# storage, so an HTML report has no home on either. Export it with
# LOCAL_NOTIS_DOWNLOAD_SANDBOX_FILE instead and post the `view_url` it returns:
# that is a Notis page that renders the document. See the new-workspace skill.
set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }

file="${1:-}"
slug="${2:-}"
[ -n "$file" ] || die "usage: attach.sh <file> [owner/repo]"
[ -f "$file" ] || die "no such file: $file"

lowered="$(printf '%s' "$file" | tr '[:upper:]' '[:lower:]')"
case "$lowered" in
    *.png)  content_type="image/png" ;;
    *.jpg|*.jpeg) content_type="image/jpeg" ;;
    *.gif)  content_type="image/gif" ;;
    *.webp) content_type="image/webp" ;;
    *.mp4)  content_type="video/mp4" ;;
    *.mov)  content_type="video/quicktime" ;;
    *.webm) content_type="video/webm" ;;
    *.html|*.htm)
        die "GitHub does not accept HTML. Export it with LOCAL_NOTIS_DOWNLOAD_SANDBOX_FILE and post the view_url instead." ;;
    *)
        die "unsupported type: $file (images and video only)" ;;
esac

if [ -z "$slug" ]; then
    remote="$(git -C "$(dirname "$file")" remote get-url origin 2>/dev/null || true)"
    [ -n "$remote" ] || die "no origin remote near $file -- pass owner/repo explicitly"
    slug="$(printf '%s' "$remote" | sed -E 's#^git@github\.com:##; s#^https://github\.com/##; s#\.git$##')"
fi

repository_id="$(gh api "repos/$slug" -q .id)" \
    || die "could not resolve $slug -- is the cloud computer signed in? run gh_login.py"

name="$(basename "$file")"
response="$(curl -fsS -X POST \
    "https://uploads.github.com/user-attachments/assets?repository_id=${repository_id}&name=${name}&content_type=${content_type}" \
    -H "Authorization: Bearer $(gh auth token)" \
    -H "Accept: application/json" \
    --data-binary "@$file")" \
    || die "upload rejected -- check that the extension matches the content type"

printf '%s\n' "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["url"])'
