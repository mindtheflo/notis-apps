# Conductor Changelog

## [Initial Release] - {PR_MERGE_DATE}

- First Store release.
- `new-workspace` names one destination per artifact kind, because the two are
  not interchangeable and the failure is silent. Screenshots and video go to
  GitHub's attachment store through `attach.sh`, which inherits the
  repository's visibility; HTML reports go through
  `LOCAL_NOTIS_DOWNLOAD_SANDBOX_FILE` and are posted as its `view_url`, since
  GitHub refuses `text/html` and Supabase serves the attachments bucket as
  `text/plain`. A raw storage URL is rewritten for Notis messages by `/send`,
  but a pull request comment never crosses that boundary.
- A review an automation started claims the pull request with a single `👀`
  comment before it reads anything, and edits that same comment at the end with
  what was tested, what was fixed and what was committed. Nobody watches the
  conversation an automation runs in, so the pull request has to carry both
  ends of the review; a hidden marker in the comment body is how the next run
  finds it again instead of stacking a second one.
- A workspace opens a draft pull request at its first commit rather than at the
  end of the work, and work is committed to the branch before the agent hands
  control back. The pull request is the only place a workspace can be followed
  once the conversation that created it is over, so `new-workspace` treats it as
  part of starting work rather than part of finishing it.
- `repositories` records where a project's environment files are staged in one
  `Environment files` property of the platform's `secret` kind, which stores a
  reference, a status and the file names and has no field for a value. It
  replaces the earlier `Secrets status`, `Secrets path` and `Secret files`
  properties; `new-repository`'s `repo.sh sync` rewrites it for any row that
  predates the change.
