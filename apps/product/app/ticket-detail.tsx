import {ReaderSelection} from '@/components/reader-selection';
'use client';

/**
 * The right-hand ticket panel: the properties that are not worth a column in
 * the list, plus the ticket body.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Markdown, ViewSkeleton, useDocument, useHandover } from '@notis/sdk';
import { ArrowSquareOutIcon, ChatCircleIcon, DotsThreeIcon, TrashIcon, XIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Menu, MenuCaret, PriorityMark, StatusMark, TypeDot } from './controls';
import {
  PRIORITY_ORDER,
  STATUS_META,
  STATUS_ORDER,
  TICKET_SIZES,
  TICKET_TYPES,
  formatDate,
  resetTicketPanelScroll,
  type Ticket,
  type TicketPriority,
  type TicketSize,
  type TicketStatus,
  type TicketType,
  type Version,
} from './product';

interface TicketDetailProps {
  ticket: Ticket;
  versions: Version[];
  onClose: () => void;
  onDelete: () => void;
  deletePending: boolean;
  onSave: (patch: Partial<Ticket>, properties: Record<string, unknown>) => Promise<void> | void;
  onSaveBody: (markdown: string) => Promise<void>;
}

export function TicketDetail({
  ticket,
  versions,
  onClose,
  onDelete,
  deletePending,
  onSave,
  onSaveBody,
}: TicketDetailProps) {
  const [title, setTitle] = useState(ticket.title);
  const [editingBody, setEditingBody] = useState(false);
  const [body, setBody] = useState('');
  const [savingBody, setSavingBody] = useState(false);
  const scrollPaneRef = useRef<HTMLDivElement | null>(null);
  const handover = useHandover();
  // The list query carries properties only; the ticket body needs its own read.
  const detail = useDocument(ticket.id);
  const description = detail.document?.contentMarkdown ?? ticket.description ?? null;

  useLayoutEffect(() => {
    resetTicketPanelScroll(scrollPaneRef.current);
  }, [ticket.id]);

  useEffect(() => {
    setTitle(ticket.title);
    setEditingBody(false);
  }, [ticket.id, ticket.title]);

  useEffect(() => {
    setBody(description ?? '');
  }, [description]);

  const commitTitle = () => {
    const next = title.trim();
    if (!next || next === ticket.title) {
      setTitle(ticket.title);
      return;
    }
    void onSave({ title: next }, { title: next });
  };

  const linkedVersions = ticket.versionIds
    .map((id) => versions.find((version) => version.id === id))
    .filter((version): version is Version => Boolean(version));

  return (
    <aside className="flex min-h-0 min-w-0 w-full flex-1 flex-col bg-muted/40 lg:w-96 lg:flex-none lg:border-l lg:border-border">
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <span className="font-mono text-xs text-muted-foreground">{ticket.key}</span>
        <span className="ml-auto" />
        {handover.available ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void handover.handover({
                prompt: `Let's work on ticket ${ticket.key}: ${ticket.title}`,
              })
            }
          >
            <ChatCircleIcon className="mr-1.5 h-3.5 w-3.5" />
            Discuss
          </Button>
        ) : null}
        <Menu
          label="Ticket actions"
          align="end"
          value={null}
          disabled={deletePending}
          options={[{ value: 'delete', label: 'Delete ticket', icon: <TrashIcon className="size-4 text-destructive" /> }]}
          onSelect={onDelete}
          trigger={<DotsThreeIcon className="size-5 shrink-0" />}
          className="[&>button]:size-8 [&>button]:justify-center [&>button]:p-0"
        />
        <Button variant="ghost" size="sm" className="size-8 shrink-0 p-0" onClick={onClose} aria-label="Close ticket">
          <XIcon className="h-4 w-4" />
        </Button>
      </div>

      <div
        ref={scrollPaneRef}
        data-ticket-detail-scroll
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3"
      >
        <textarea
          value={title}
          name="ticket-title"
          aria-label="Ticket title"
          rows={1}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          className="w-full min-h-6 resize-none bg-transparent p-0 text-base font-semibold outline-none [field-sizing:content]"
        />

        <dl className="mt-3 space-y-1 text-sm sm:text-xs">
          <Field label="Status">
            <Menu
              options={STATUS_ORDER.map((status) => ({
                value: status,
                label: STATUS_META[status].label,
                icon: <StatusMark status={status} />,
              }))}
              value={ticket.status}
              onSelect={(status: TicketStatus) => void onSave({ status }, { Status: status })}
              trigger={
                <span className="flex items-center gap-1.5">
                  <StatusMark status={ticket.status} />
                  {STATUS_META[ticket.status].label}
                  <MenuCaret />
                </span>
              }
            />
          </Field>
          <Field label="Priority">
            <Menu
              options={PRIORITY_ORDER.map((priority) => ({
                value: priority,
                label: priority,
                icon: <PriorityMark priority={priority} />,
              }))}
              value={ticket.priority}
              onSelect={(priority: TicketPriority) =>
                void onSave({ priority }, { Priority: priority })
              }
              trigger={
                <span className="flex items-center gap-1.5">
                  <PriorityMark priority={ticket.priority} />
                  {ticket.priority}
                  <MenuCaret />
                </span>
              }
            />
          </Field>
          <Field label="Type">
            <Menu
              options={TICKET_TYPES.map((type) => ({
                value: type,
                label: type,
                icon: <TypeDot type={type} />,
              }))}
              value={ticket.type}
              onSelect={(type: TicketType) => void onSave({ type }, { Type: type })}
              trigger={
                <span className="flex items-center gap-1.5">
                  <TypeDot type={ticket.type} />
                  {ticket.type}
                  <MenuCaret />
                </span>
              }
            />
          </Field>
          <Field label="Size">
            <Menu
              options={[
                { value: 'none', label: 'Unset' },
                ...TICKET_SIZES.map((size) => ({ value: size, label: size })),
              ]}
              value={ticket.size ?? 'none'}
              onSelect={(value) => {
                const size = value === 'none' ? null : (value as TicketSize);
                void onSave({ size }, { Size: size });
              }}
              trigger={
                <span className="flex items-center gap-1.5">
                  {ticket.size ?? 'Unset'}
                  <MenuCaret />
                </span>
              }
            />
          </Field>
          <Field label="Version">
            <Menu
              options={[
                { value: 'none', label: 'No version' },
                ...versions.map((version) => ({ value: version.id, label: version.name })),
              ]}
              value={ticket.versionIds}
              onSelect={(value) => {
                const versionIds = value === 'none' ? [] : [value];
                void onSave({ versionIds }, { Version: versionIds });
              }}
              trigger={
                <span className="flex items-center gap-1.5">
                  {linkedVersions.length > 0
                    ? linkedVersions.map((version) => version.name).join(', ')
                    : 'No version'}
                  <MenuCaret />
                </span>
              }
            />
          </Field>
          <Field label="Shipped">
            <DateValue
              value={ticket.shippedOn}
              onChange={(next) => void onSave({ shippedOn: next }, { 'Shipped on': next })}
            />
          </Field>
          <Field label="Due">
            <DateValue
              value={ticket.due}
              onChange={(next) => void onSave({ due: next }, { Due: next })}
            />
          </Field>
          <Field label="Link">
            {ticket.link ? (
              <a
                href={ticket.link}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 truncate px-1.5 text-primary hover:underline"
              >
                <span className="truncate">{ticket.link.replace(/^https?:\/\//, '')}</span>
                <ArrowSquareOutIcon className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="px-1.5 text-muted-foreground">None</span>
            )}
          </Field>
          <Field label="Docs">
            <Toggle
              value={ticket.docsUpdated}
              onChange={(next) => void onSave({ docsUpdated: next }, { 'Docs updated': next })}
              onLabel="Updated"
              offLabel="Not updated"
            />
          </Field>
          <Field label="Social">
            <Toggle
              value={ticket.socialPostCreated}
              onChange={(next) =>
                void onSave({ socialPostCreated: next }, { 'Social post created': next })
              }
              onLabel="Post created"
              offLabel="No post"
            />
          </Field>
        </dl>

        {linkedVersions.some((version) => version.changelogUrl) ? (
          <div className="mt-4 rounded-xl bg-background p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Shipped in
            </p>
            {linkedVersions.map((version) => (
              <a
                key={version.id}
                href={version.changelogUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                {version.name}
                {version.releaseDate ? (
                  <span className="text-muted-foreground">· {formatDate(version.releaseDate)}</span>
                ) : null}
                <ArrowSquareOutIcon className="h-3 w-3" />
              </a>
            ))}
          </div>
        ) : null}

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Description
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={savingBody}
              onClick={async () => {
                if (!editingBody) {
                  setEditingBody(true);
                  return;
                }
                setSavingBody(true);
                try {
                  await onSaveBody(body);
                  detail.refetch();
                  setEditingBody(false);
                } finally {
                  setSavingBody(false);
                }
              }}
            >
              {editingBody ? (savingBody ? 'Saving…' : 'Save') : 'Edit'}
            </Button>
          </div>
          {editingBody ? (
            <textarea
              value={body}
              rows={10}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Markdown description…"
              className="mt-2 w-full resize-none rounded-lg bg-background p-2 text-xs outline-none focus-visible:bg-muted/40"
            />
          ) : description ? (
            <ReaderSelection resource={{id:ticket.id,kind:'product-ticket',label:`${ticket.key}: ${ticket.title}`,revision:detail.document?.lastEditedTime||''}} className="mt-2 text-sm">
              <Markdown value={description} size="sm" />
            </ReaderSelection>
          ) : detail.error ? (<p role="alert" className="mt-2 text-sm text-muted-foreground">Could not load the description. <button type="button" onClick={detail.refetch}>Retry</button></p>) : detail.hasData ? (
            <p className="mt-2 text-xs text-muted-foreground">No description yet.</p>
          ) : (
            <ViewSkeleton variant="detail" rows={3} />
          )}
        </div>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function DateValue({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <input
      type="date"
      value={value ? value.slice(0, 10) : ''}
      onChange={(event) => onChange(event.target.value || null)}
      className="w-full rounded-md bg-transparent px-1.5 py-1 text-xs outline-none transition-colors hover:bg-muted focus:bg-muted"
    />
  );
}

function Toggle({
  value,
  onChange,
  onLabel,
  offLabel,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        'rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-muted',
        value ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {value ? onLabel : offLabel}
    </button>
  );
}
