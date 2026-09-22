'use client';

/**
 * Inline editing primitives.
 *
 * Every one of these edits in place: the read state and the write state occupy
 * the same box, so nothing shifts when a field is clicked and no modal stands
 * between the user and a one-word change.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CheckIcon, CaretLeftIcon, CaretRightIcon, XIcon } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import { addDays, parseDayKey, toDayKey, todayKey } from '@/lib/tasks';

// ---------------------------------------------------------------------------
// Popover shell
// ---------------------------------------------------------------------------

/**
 * Closes on a pointer press outside the popover. The listener attaches to the
 * shadow root the portal mounts the app in, since a document-level listener
 * never sees events retargeted inside a shadow tree.
 */
function useDismiss(open: boolean, onDismiss: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Callers pass an inline arrow; keeping it in a ref stops the listener from
  // being torn down and re-attached on every render.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: Event) {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      dismissRef.current();
    }
    function handleKeyDown(event: Event) {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        event.stopPropagation();
        dismissRef.current();
      }
    }

    const root = containerRef.current?.getRootNode();
    const eventTarget = root instanceof ShadowRoot || root instanceof Document ? root : document;
    eventTarget.addEventListener('pointerdown', handlePointerDown);
    eventTarget.addEventListener('keydown', handleKeyDown);
    return () => {
      eventTarget.removeEventListener('pointerdown', handlePointerDown);
      eventTarget.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return containerRef;
}

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = 'start',
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) {
  const containerRef = useDismiss(open, () => onOpenChange(false));
  const panelRef = useRef<HTMLDivElement>(null);
  const [dropUp, setDropUp] = useState(false);

  // Flip above the trigger when the panel would run past the viewport bottom.
  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setDropUp(rect.bottom > window.innerHeight - 8 && rect.top > rect.height);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {trigger({ open, toggle: () => onOpenChange(!open) })}
      {open ? (
        <div
          ref={panelRef}
          className={cn(
            'absolute z-30 mt-1 min-w-[200px] rounded-lg bg-popover p-1 text-popover-foreground shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
            dropUp && 'bottom-full mb-1 mt-0',
            className,
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  active,
  onSelect,
  children,
  className,
}: {
  active?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
        active ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted/60',
        className,
      )}
    >
      {children}
      {active ? <CheckIcon className="ml-auto h-3.5 w-3.5 shrink-0" /> : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * A single-line field that turns into an input on click. Enter and blur commit;
 * Escape restores the value it was opened with.
 */
export function InlineText({
  value,
  onCommit,
  placeholder = 'Untitled',
  className,
  inputClassName,
  readClassName,
  ariaLabel,
  autoEdit = false,
  allowEmpty = false,
  onEditingChange,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  readClassName?: string;
  ariaLabel: string;
  autoEdit?: boolean;
  /** Titles must stay named; optional fields may be cleared to nothing. */
  allowEmpty?: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  // Blur fires while committing on Enter; this keeps it from committing twice.
  const committedRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const editingChangeRef = useRef(onEditingChange);
  editingChangeRef.current = onEditingChange;
  useEffect(() => {
    editingChangeRef.current?.(editing);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [editing]);

  function stop() {
    setEditing(false);
    committedRef.current = false;
  }

  function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    const next = draft.trim();
    stop();
    if ((next || allowEmpty) && next !== value) onCommit(next);
    else setDraft(value);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setDraft(value);
            committedRef.current = true;
            stop();
          }
        }}
        className={cn(
          'w-full min-w-0 rounded-md bg-muted px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
          inputClassName,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => setEditing(true)}
      className={cn(
        'w-full min-w-0 truncate rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-muted/60',
        !value && 'text-muted-foreground',
        className,
        readClassName,
      )}
    >
      {value || placeholder}
    </button>
  );
}

/** Multi-line variant for descriptions. Commits on blur; Escape reverts. */
export function InlineTextarea({
  value,
  onCommit,
  placeholder = 'Add a description',
  ariaLabel,
  className,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const node = textareaRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, [editing]);

  function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    const next = draft.trim();
    setEditing(false);
    committedRef.current = false;
    if (next !== value.trim()) onCommit(next);
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        aria-label={ariaLabel}
        value={draft}
        rows={Math.min(10, Math.max(2, draft.split('\n').length))}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setDraft(value);
            committedRef.current = true;
            setEditing(false);
            committedRef.current = false;
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            commit();
          }
        }}
        className={cn(
          'w-full resize-y rounded-md bg-muted px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => setEditing(true)}
      className={cn(
        'w-full whitespace-pre-wrap rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60',
        !value && 'text-muted-foreground',
        className,
      )}
    >
      {value || placeholder}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

function startOfGrid(month: Date): Date {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const weekday = (first.getDay() + 6) % 7; // Monday-first
  return addDays(first, -weekday);
}

export function DatePicker({
  value,
  onChange,
  onClose,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  onClose: () => void;
}) {
  const selected = value ? parseDayKey(value) : null;
  const [month, setMonth] = useState(
    () => new Date((selected ?? new Date()).getFullYear(), (selected ?? new Date()).getMonth(), 1),
  );
  const today = todayKey();
  const days = Array.from({ length: 42 }, (_, index) => addDays(startOfGrid(month), index));

  function pick(next: string | null) {
    onChange(next);
    onClose();
  }

  const quickOptions: Array<{ label: string; key: string | null }> = [
    { label: 'Today', key: today },
    { label: 'Tomorrow', key: toDayKey(addDays(new Date(), 1)) },
    { label: 'Next week', key: toDayKey(addDays(new Date(), 7)) },
    { label: 'No date', key: null },
  ];

  return (
    <div className="w-[248px] p-1">
      <div className="pb-1">
        {quickOptions.map((option) => (
          <MenuItem
            key={option.label}
            active={option.key === value}
            onSelect={() => pick(option.key)}
          >
            {option.label}
          </MenuItem>
        ))}
      </div>
      <div className="flex items-center justify-between px-1 py-1.5">
        <button
          type="button"
          aria-label="Previous month"
          onPointerDown={(event) => {
            event.preventDefault();
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
          }}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <CaretLeftIcon className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs font-medium">{MONTH_FORMAT.format(month)}</span>
        <button
          type="button"
          aria-label="Next month"
          onPointerDown={(event) => {
            event.preventDefault();
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
          }}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <CaretRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 px-1 pb-1 text-center text-xs font-medium uppercase text-muted-foreground">
        {WEEKDAYS.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 px-1 pb-1">
        {days.map((day) => {
          const key = toDayKey(day);
          const inMonth = day.getMonth() === month.getMonth();
          return (
            <button
              key={key}
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                pick(key);
              }}
              className={cn(
                'inline-flex h-7 items-center justify-center rounded-md text-xs transition-colors',
                inMonth ? 'text-foreground' : 'text-muted-foreground/50',
                key === today && 'font-semibold text-primary',
                key === value
                  ? 'bg-primary text-primary-foreground hover:bg-primary'
                  : 'hover:bg-muted',
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-select
// ---------------------------------------------------------------------------

/** Label chooser: pick from what exists, or type a new one. */
export function LabelPicker({
  selected,
  options,
  onChange,
}: {
  selected: string[];
  options: string[];
  onChange: (labels: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const normalized = query.trim();
  const matches = options.filter((option) =>
    option.toLowerCase().includes(normalized.toLowerCase()),
  );
  const canCreate =
    normalized.length > 0 && !options.some((option) => option.toLowerCase() === normalized.toLowerCase());

  function toggle(label: string) {
    onChange(
      selected.includes(label)
        ? selected.filter((item) => item !== label)
        : [...selected, label],
    );
  }

  return (
    <div className="w-[220px] p-1">
      <input
        autoFocus
        value={query}
        placeholder="Filter or add a label"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && canCreate) {
            event.preventDefault();
            toggle(normalized);
            setQuery('');
          }
        }}
        className="mb-1 h-8 w-full rounded-md bg-muted px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
      <div className="max-h-[220px] overflow-y-auto">
        {matches.map((label) => (
          <MenuItem key={label} active={selected.includes(label)} onSelect={() => toggle(label)}>
            <span className="truncate">{label}</span>
          </MenuItem>
        ))}
        {canCreate ? (
          <MenuItem
            onSelect={() => {
              toggle(normalized);
              setQuery('');
            }}
          >
            <span className="truncate">Add “{normalized}”</span>
          </MenuItem>
        ) : null}
        {matches.length === 0 && !canCreate ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">No labels yet.</p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

/** The read/trigger surface every inline field shares. */
export function Chip({
  children,
  className,
  onClick,
  ariaLabel,
  muted,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  ariaLabel: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'inline-flex max-w-[220px] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-muted',
        muted ? 'text-muted-foreground' : 'text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DismissButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <XIcon className="h-3 w-3" />
    </button>
  );
}
