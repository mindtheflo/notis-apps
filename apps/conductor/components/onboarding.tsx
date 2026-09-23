'use client';

import { useState } from 'react';
import { useCloudComputer, useHandover } from '@notis/sdk';
import {
  CheckCircleIcon,
  CircleIcon,
  CopyIcon,
  GitBranchIcon,
  GithubLogoIcon,
  PaperPlaneTiltIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { GithubConnect } from '@/components/github-connect';
import { cn } from '@/lib/utils';

/**
 * First run.
 *
 * Step one is a real control: views can run commands on the cloud computer, so
 * the app signs the GitHub CLI in itself rather than asking someone to paste a
 * sentence into a chat. The remaining steps still hand off, because cloning a
 * repository and setting it up are long, conversational jobs where the agent
 * has to ask questions and report what it found -- a spinner is the wrong shape
 * for that. Progress comes from what has actually been recorded.
 *
 * Handing off is a button now: `useHandover` puts the message in the manager
 * chat, which already owns streaming, billing and cancellation, and names the
 * skill that does the work so the manager is not left inferring it from the
 * prompt. Hosts without that chat (the dev harness, the vite preview) fall back
 * to copying the prompt, which is what this used to be everywhere.
 */

type Step = {
  title: string;
  detail: string;
  prompt: string;
  /**
   * Key of a skill declared in `notis.config.ts` -> `skills`. The manager gets
   * the procedure with the message instead of having to pick a skill out of the
   * prompt's wording, and the host rejects a key this app does not declare --
   * so a renamed skill fails here rather than quietly handing over plain work.
   */
  skill?: string;
  icon: React.ComponentType<{ className?: string; weight?: 'regular' | 'fill' }>;
};

const STEPS: Step[] = [
  {
    title: 'Connect GitHub',
    detail:
      'Signs the GitHub CLI on your cloud computer in with a one-time device code, so it can read your private repositories and open pull requests as you.',
    prompt: '',
    icon: GithubLogoIcon,
  },
  {
    title: 'Add your first repository',
    detail:
      'Clones the project, takes its environment files, works out how it builds and runs, and proves it runs before calling it ready.',
    prompt: 'Set up a new repository: https://github.com/OWNER/REPO',
    skill: 'new-repository',
    icon: GitBranchIcon,
  },
  {
    title: 'Start a workspace',
    detail:
      'Creates a git worktree on its own branch for one task, with the repository secrets already in place. Work is committed to that branch and opens as a draft pull request, so you can follow it here after the conversation ends.',
    prompt: 'Create a workspace on REPO to ...',
    skill: 'new-workspace',
    icon: GitBranchIcon,
  },
];

function HandoffPrompt({ prompt, skill }: { prompt: string; skill?: string }) {
  const { handover, pending, available } = useHandover();
  const [copied, setCopied] = useState(false);
  // A refused handover drops back to the prompt rather than stranding the step.
  const [handoverFailed, setHandoverFailed] = useState(false);

  return (
    <div className="mt-3 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2.5 py-1.5 font-mono text-xs">
        {prompt}
      </code>
      {available && !handoverFailed ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            void handover({ prompt, ...(skill ? { skill } : {}) }).catch(() =>
              setHandoverFailed(true),
            );
          }}
        >
          <PaperPlaneTiltIcon className="mr-1.5 h-3.5 w-3.5" />
          {pending ? 'Opening' : 'Send to Notis'}
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(prompt)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              })
              // Clipboard access can be refused; saying nothing would look like
              // the button is broken.
              .catch(() => setCopied(false));
          }}
        >
          <CopyIcon className="mr-1.5 h-3.5 w-3.5" />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      )}
    </div>
  );
}

export function Onboarding({
  hasRepository,
  hasWorkspace,
}: {
  hasRepository: boolean;
  hasWorkspace: boolean;
}) {
  // GitHub sign-in is real state now: `cloudComputer: 'read'` reports what
  // `gh auth status` says on the cloud computer, so the step can be marked done
  // before any repository exists and can notice a revoked credential.
  // `authenticated` is null when the answer is unknown -- no cloud computer, a
  // sleeping sandbox, a host that cannot answer -- and the old inference (a
  // configured repository proves a private clone succeeded) stands in for it.
  const { facts, refresh } = useCloudComputer();
  // The platform caches the facts for a few minutes, so a sign-in that just
  // completed in this view would otherwise sit unchecked. The device flow ran
  // here, so this component already knows the answer.
  const [justSignedIn, setJustSignedIn] = useState(false);
  const gh = facts?.available ? facts.cli_auth.gh : null;
  const githubConnected = justSignedIn
    || (typeof gh?.authenticated === 'boolean' ? gh.authenticated : hasRepository);
  const done = [githubConnected, hasRepository, hasWorkspace];
  const current = done.findIndex((complete) => !complete);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12" data-store-screenshot="onboarding">
      <h2 className="text-lg font-semibold tracking-tight">Set up your cloud computer</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect GitHub here, then hand the rest to Notis. It does the work on your cloud
        computer and this view fills in as it goes.
      </p>

      <ol className="mt-8 space-y-3">
        {STEPS.map((step, index) => {
          const complete = done[index];
          const active = index === current;
          const Icon = step.icon;
          return (
            <li
              key={step.title}
              className={cn(
                'rounded-2xl p-4 transition-colors',
                active ? 'bg-muted' : 'bg-transparent',
              )}
            >
              <div className="flex items-start gap-3">
                {complete ? (
                  <CheckCircleIcon weight="fill" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <CircleIcon
                    className={cn(
                      'mt-0.5 h-5 w-5 shrink-0',
                      active ? 'text-foreground' : 'text-muted-foreground/50',
                    )}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span
                      className={cn(
                        'text-sm font-medium',
                        !active && !complete && 'text-muted-foreground',
                      )}
                    >
                      {step.title}
                    </span>
                    {index === 0 && complete && gh?.account ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {gh.account}
                      </span>
                    ) : null}
                  </div>
                  {(active || !complete) && (
                    <>
                      <p className="mt-1.5 text-sm text-muted-foreground">{step.detail}</p>
                      {active && index === 0 && (
                        <div className="mt-3">
                          <GithubConnect
                            onConnected={() => {
                              setJustSignedIn(true);
                              void refresh();
                            }}
                          />
                        </div>
                      )}
                      {active && index > 0 && step.prompt && (
                        <HandoffPrompt prompt={step.prompt} skill={step.skill} />
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
