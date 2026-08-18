'use client';

import { useCallback, useRef, useState } from 'react';
import { useTool } from '@notis/sdk';
import { CheckCircleIcon, CircleNotchIcon, KeyIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { SCRIPTS, quote, useSandboxShell } from '@/lib/shell';
import type { Repository } from '@/lib/types';

/**
 * Send a repository's environment files to the cloud computer.
 *
 * The bytes go browser -> runtime bridge -> sandbox filesystem. They are never
 * given a URL, never stored, and never read into a conversation, which is the
 * whole reason this control exists rather than asking the user to send the
 * files to Notis in a message: an attachment is published to a public bucket
 * at a permanent address, which for a file of production keys is the wrong
 * thing to do exactly once.
 */

type UploadArgs = {
  path: string;
  content: string;
  content_encoding?: 'base64' | 'utf-8';
  overwrite?: boolean;
  mode?: number;
};
type UploadResult = { status?: string; path?: string; size?: number; message?: string };

const MAX_BYTES = 512 * 1024;

type Outcome =
  | { kind: 'idle' }
  | { kind: 'sending'; done: number; total: number }
  | { kind: 'sent'; files: string[] }
  | { kind: 'failed'; message: string };

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Chunked: spreading a large array into String.fromCharCode blows the
  // argument limit on files of any size.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Rebuild the path a file should take inside the repository.
 *
 * A directory picker gives `webkitRelativePath` like `notis/server/.env`; its
 * first segment is the chosen folder itself and has to go. A plain multi-file
 * pick has no relative path at all, so the best available answer is the bare
 * filename.
 */
function relativePathFor(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (relative && relative.includes('/')) {
    return relative.split('/').slice(1).join('/');
  }
  return file.name;
}

export function SecretsUpload({
  repository,
  onUploaded,
}: {
  repository: Repository;
  onUploaded: () => void;
}) {
  const upload = useTool<UploadArgs, UploadResult>('LOCAL_NOTIS_UPLOAD_SANDBOX_FILE');
  const inputRef = useRef<HTMLInputElement>(null);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  const uploadCall = upload.call;
  const { run: runShell } = useSandboxShell();
  const secretsPath = repository.secretsPath;

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      if (!secretsPath) {
        setOutcome({ kind: 'failed', message: 'This repository has no secrets directory yet.' });
        return;
      }

      const files = Array.from(fileList).filter((file) => {
        const name = file.name;
        return name === '.env' || name.startsWith('.env') || name.endsWith('.env');
      });
      if (files.length === 0) {
        setOutcome({
          kind: 'failed',
          message: 'No environment files in that selection. Pick .env files.',
        });
        return;
      }
      const preparedFiles = files.map((file) => ({ file, relative: relativePathFor(file) }));
      const duplicate = preparedFiles.find(
        ({ relative }, index) => preparedFiles.findIndex((item) => item.relative === relative) !== index,
      );
      if (duplicate) {
        setOutcome({
          kind: 'failed',
          message: `Two selected files resolve to ${duplicate.relative}. Pick the repository folder so paths stay distinct.`,
        });
        return;
      }
      const tooBig = files.find((file) => file.size > MAX_BYTES);
      if (tooBig) {
        setOutcome({ kind: 'failed', message: `${tooBig.name} is too large to be an env file.` });
        return;
      }

      const sent: string[] = [];
      const uploadRoot = `/vercel/sandbox/.notis/workspaces/uploads/${repository.name}-${crypto.randomUUID()}`;
      try {
        const prepared = await runShell(`mkdir -p ${quote(uploadRoot)} && chmod 700 ${quote(uploadRoot)}`);
        if (!prepared.ok) {
          throw new Error(
            prepared.error ?? (prepared.stderr.trim() || 'Could not prepare a secure upload directory'),
          );
        }
        for (const { file, relative } of preparedFiles) {
          setOutcome({ kind: 'sending', done: sent.length, total: files.length });
          const result = await uploadCall({
            path: `${uploadRoot}/${relative}`,
            content: toBase64(await file.arrayBuffer()),
            content_encoding: 'base64',
            overwrite: true,
            // 0600: a credentials file must not be world readable.
            mode: 0o600,
          });
          // A result without a status key is not a success; only the explicit
          // contract counts.
          if (result?.status !== 'success') {
            throw new Error(result?.message || `Could not write ${relative}`);
          }
          sent.push(relative);
        }
        // Record what landed: secrets-install is the only writer of the row's
        // `Environment files` secret property, and it handles the
        // files-already-in-place case. Without it the row would still say
        // "Missing" no matter how live the view is.
        const recorded = await runShell(
          `bash ${SCRIPTS}/repo.sh secrets-install ${quote(repository.name)} ${quote(uploadRoot)}`,
        );
        if (!recorded.ok) {
          throw new Error(
            recorded.error
              ?? (recorded.stderr.trim() || 'Files were sent but could not be recorded'),
          );
        }
        setOutcome({ kind: 'sent', files: sent });
        onUploaded();
      } catch (cause) {
        setOutcome({
          kind: 'failed',
          message: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        await runShell(`rm -rf -- ${quote(uploadRoot)}`);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [secretsPath, uploadCall, runShell, repository.name, onUploaded],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={outcome.kind === 'sending'}
          onClick={() => inputRef.current?.click()}
        >
          {outcome.kind === 'sending' ? (
            <CircleNotchIcon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <KeyIcon className="mr-1.5 h-3.5 w-3.5" />
          )}
          {outcome.kind === 'sending'
            ? `Sending ${outcome.done + 1} of ${outcome.total}`
            : repository.secretFiles.length > 0
              ? 'Replace environment files'
              : 'Add environment files'}
        </Button>

        {outcome.kind === 'sent' && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircleIcon weight="fill" className="h-4 w-4" />
            Sent {outcome.files.length} file{outcome.files.length === 1 ? '' : 's'}
          </span>
        )}
        {outcome.kind === 'failed' && (
          <span className="inline-flex items-center gap-1.5 text-sm text-red-700 dark:text-red-400">
            <WarningCircleIcon className="h-4 w-4" />
            {outcome.message}
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        // Folder selection is required to preserve `server/.env` versus
        // `portal/.env`; a flat multi-file picker reduces both to `.env`.
        webkitdirectory=""
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <p className="mt-2 text-xs text-muted-foreground">
        Sent straight to your cloud computer. The values are never stored by Notis, never given a
        link, and never read into a conversation.
      </p>
    </div>
  );
}
