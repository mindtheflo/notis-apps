import { defineNotisApp } from '@notis/sdk/config';

export default defineNotisApp({
  name: 'conductor',
  title: 'Conductor',
  description:
    'Track the git repositories configured on your Notis cloud computer and every workspace checked out from them. Each workspace is a git worktree on its own branch, created for one task: see its branch, how far ahead it is, uncommitted work, and its pull request state. Work opens as a draft pull request from the first commit, so a workspace stays reviewable after the conversation ends. The Repositories view shows how each project builds and runs and which environment files are staged.',
  icon: 'phosphor:git-branch',
  accent: 'violet',
  author: { name: 'Notis' },
  categories: ['Product & Engineering', 'Operations'],
  tagline: 'Every repository and task workspace on your cloud computer.',
  screenshots: [
    {
      path: 'metadata/screenshot-1.png',
      alt: 'Workspaces grouped by repository, each showing its branch, base, commits ahead, uncommitted files, and pull request state with the check rollup.',
      route: 'workspaces',
      focus: '[data-store-screenshot="workspaces"]',
      theme: 'light',
    },
    {
      path: 'metadata/screenshot-2.png',
      alt: 'The same workspace list in dark mode, with an open pull request, a draft, a clean workspace, and a merged one.',
      route: 'workspaces',
      focus: '[data-store-screenshot="workspaces"]',
      theme: 'dark',
    },
    {
      path: 'metadata/screenshot-3.png',
      alt: 'Repositories view showing the setup, run, and archive commands resolved for each project and the environment files staged for it.',
      route: 'repositories',
      focus: '[data-store-screenshot="repositories"]',
      theme: 'light',
    },
    {
      path: 'metadata/screenshot-4.png',
      alt: 'The repository detail in dark mode, listing staged environment file names without their values.',
      route: 'repositories',
      focus: '[data-store-screenshot="repositories"]',
      theme: 'dark',
    },
    {
      // Same route as the first image, in the state a new installation starts
      // in. The `onboarding-empty` scenario blanks both database queries and
      // signs GitHub out, so this is the real first-run view rather than a
      // mock-up of one. No `focus`: the checklist is the whole page here, and
      // framing it to its own bounding box crops the last step out.
      path: 'metadata/screenshot-5.png',
      alt: 'First run: connect GitHub on the cloud computer, then hand adding a repository and starting a workspace to Notis.',
      route: 'workspaces',
      scenario: 'onboarding-empty',
      theme: 'light',
    },
  ],
  databases: ['repositories', 'workspaces'],
  // Declared from source, so the skills ship with the app instead of being
  // published on the side and attached by id. A directory path packages every
  // file under it, which is why the shared scripts live in a directory of
  // their own: a skill's bundle stops at its own directory, and symlinks are
  // skipped, so `../` out of one skill into another would have arrived empty.
  // The three directories land side by side under
  // /vercel/sandbox/.notis/skills/<name>/, and both task skills call the one
  // copy of the scripts in `workspaces-shared`.
  skills: [
    {
      key: 'new-repository',
      path: './skills/new-repository/',
      name: 'new-repository',
      description:
        'Configure a git repository on the Notis cloud computer so workspaces can be created from it. Use when the user wants to add, set up, or reconnect a repository, sign the cloud computer in to GitHub, or fix a repository whose setup or secrets are incomplete. Also the first-run onboarding for Conductor.',
    },
    {
      key: 'new-workspace',
      path: './skills/new-workspace/',
      name: 'new-workspace',
      // Kept identical to the SKILL.md frontmatter: this string is the one
      // registered for discovery, that one is what the agent reads, and a
      // workspace that opens no pull request is invisible from outside the
      // conversation that made it -- so both have to say so.
      description:
        'Create an isolated workspace on the Notis cloud computer to work on a task in a configured repository, commit the work to that branch, and track it as a draft pull request from the first commit onwards. Use when the user wants to start work on a bug, feature, or pull request, asks for a new branch or worktree, or wants the state of workspaces and their pull requests refreshed.',
    },
    {
      key: 'handover',
      path: './skills/handover/',
      name: 'handover',
      // The only skill here aimed at an agent running on the user's *own*
      // machine rather than on the cloud computer. It ships through the same
      // sync, so it lands in ~/.claude/skills and ~/.codex/skills where that
      // agent will actually read it.
      description:
        "Hand the git branch you are working on to a Notis agent from a local terminal, so it continues the work on the Notis cloud computer or on the user's Mac. Use when you are a coding agent in the user's terminal and the task should keep running after this session ends, when the user asks to give work to Notis, Codex Cloud or Claude Cloud, or when a long refactor, test-fixing pass, or migration should continue elsewhere while you carry on with something else.",
    },
    {
      key: 'workspaces-shared',
      path: './skills/workspaces-shared/',
      name: 'workspaces-shared',
      description:
        "Carries the shell and Python scripts that Conductor's new-repository and new-workspace skills run on the cloud computer. It is not a task skill and has no procedure of its own; run new-repository to configure a repository and new-workspace to start work on one.",
    },
  ],
  routes: [
    {
      path: '/',
      slug: 'workspaces',
      name: 'Workspaces',
      icon: 'phosphor:git-branch',
      default: true,
    },
    {
      path: '/repositories',
      slug: 'repositories',
      name: 'Repositories',
      icon: 'phosphor:folder-open',
    },
  ],
  // The cloud computer is reachable from here. `run_sandbox_shell` runs the
  // same scripts the skills run, so signing GitHub in and refreshing a row are
  // real controls rather than sentences to paste into a chat -- and there is no
  // second implementation to drift out of step. Long conversational work
  // (cloning, setup) still belongs to the skills, which can ask questions.
  // Uploading is separate again: the browser already holds the bytes when
  // someone picks an environment file, so they never need a public URL.
  // No `LOCAL_NOTIS_DATABASE_GET_DATABASE`: the board addresses its databases
  // by slug through `useDatabaseSubscription`, so there is no id to look up
  // first and no reason to hold a tool nothing calls.
  tools: [
    'LOCAL_NOTIS_DATABASE_QUERY',
    'LOCAL_NOTIS_UPLOAD_SANDBOX_FILE',
    'LOCAL_NOTIS_RUN_SANDBOX_SHELL',
  ],
  // Every real control above runs on the cloud computer, and views only get
  // the shell and file tools back when the user grants
  // `cloudComputer: 'shell'` at install. The grant also covers the read facts
  // onboarding needs (is the sandbox running, is GitHub signed in) without
  // waking the VM just to draw a checkmark.
  capabilities: { cloudComputer: 'shell' },
});
