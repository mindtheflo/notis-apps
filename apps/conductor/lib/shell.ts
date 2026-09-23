/**
 * Running commands on the cloud computer from the app.
 *
 * Views can call `LOCAL_NOTIS_RUN_SANDBOX_SHELL`, which is what lets this app
 * do things rather than only display what a skill did. The skills' scripts are
 * already on the sandbox, so the app drives exactly the same code paths an
 * agent does -- there is no second implementation of "create a workspace" to
 * drift out of step.
 */

'use client';

import { useCallback } from 'react';
import { useTool, useNotis } from '@notis/sdk';

const SKILLS_ROOT = '/vercel/sandbox/.notis/skills';

/**
 * One directory, not one per skill. The scripts are declared as their own
 * `workspaces-shared` skill so a declared skill directory stays self-contained
 * when it is packaged, and both task skills -- and this app -- call the same
 * copy.
 */
export const SCRIPTS = `${SKILLS_ROOT}/workspaces-shared/scripts`;

type ShellArgs = {
  command: string;
  cwd?: string;
  timeout_ms?: number;
  max_output_length?: number;
};

type ShellResult = {
  status?: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  message?: string;
  code?: string;
};

export type ShellOutcome = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Set when the call itself failed rather than the command. */
  error: string | null;
};

export function useSandboxShell() {
  const { app } = useNotis();
  const shell = useTool<ShellArgs, ShellResult>('LOCAL_NOTIS_RUN_SANDBOX_SHELL');
  const call = shell.call;

  const run = useCallback(
    async (command: string, options: { timeoutMs?: number; cwd?: string } = {}): Promise<ShellOutcome> => {
      try {
        if (!app?.id) throw new Error('The installed Coding app identity is unavailable.');
        const result = await call({
          command: `export NOTIS_CODING_APP_ID=${quote(app.id)}; ${command}`,
          // Default well under the twelve minute ceiling: anything genuinely
          // long belongs in a detached job, not in a request a person is
          // waiting on.
          timeout_ms: options.timeoutMs ?? 60_000,
          ...(options.cwd ? { cwd: options.cwd } : {}),
          max_output_length: 20_000,
        });

        // A refused or unavailable call answers with status: error and no exit
        // code; a command that ran and failed answers with a real exit code.
        // They need different messages, so keep them apart.
        if (
          !result
          || !['success', 'error'].includes(result.status || '')
          || typeof result.exit_code !== 'number'
          || (result.status === 'success' && result.exit_code !== 0)
          || (result.status === 'error' && result.exit_code === 0)
        ) {
          return {
            ok: false,
            stdout: '',
            stderr: '',
            exitCode: -1,
            error: result?.message || result?.code || 'The cloud computer returned an invalid command result.',
          };
        }
        const exitCode = result.exit_code;
        return {
          ok: exitCode === 0,
          stdout: result?.stdout ?? '',
          stderr: result?.stderr ?? '',
          exitCode,
          error: null,
        };
      } catch (cause) {
        return {
          ok: false,
          stdout: '',
          stderr: '',
          exitCode: -1,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
    [call, app?.id],
  );

  return { run };
}

/** Shell-quote a value so a path or task description cannot break the command. */
export function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Read the first JSON object out of a script's stdout. */
export function parseJson<T>(stdout: string): T | null {
  const start = stdout.indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(stdout.slice(start)) as T;
  } catch {
    return null;
  }
}
