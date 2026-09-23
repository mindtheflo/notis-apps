'use client';

/**
 * The small controls the ticket list is built from: the status ring, the
 * priority bars, and the popover menu used for every inline edit.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, CaretDownIcon } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import {
  PRIORITY_META,
  STATUS_META,
  type TicketPriority,
  type TicketStatus,
} from './product';

export function StatusMark({ status, className, tone = 'status' }: { status: TicketStatus; className?: string; tone?: 'status' | 'inherit' }) {
  const meta = STATUS_META[status];
  const circumference = 2 * Math.PI * 4.5;
  return (
    <svg
      viewBox="0 0 14 14"
      className={cn('h-3.5 w-3.5 shrink-0', tone === 'status' ? meta.ring : 'text-inherit', className)}
      aria-label={meta.label}
      role="img"
    >
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      {meta.fill > 0 ? (
        <circle
          cx="7"
          cy="7"
          r="4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeDasharray={`${circumference * meta.fill} ${circumference}`}
          transform="rotate(-90 7 7)"
        />
      ) : null}
      {status === 'Canceled' ? (
        <path d="M4.5 4.5 L9.5 9.5" stroke="hsl(var(--background))" strokeWidth="1.5" />
      ) : null}
    </svg>
  );
}

export function PriorityMark({ priority, className }: { priority: TicketPriority; className?: string }) {
  const meta = PRIORITY_META[priority];
  const heights = [4, 7, 10];
  return (
    <svg
      viewBox="0 0 14 14"
      className={cn('h-3.5 w-3.5 shrink-0', meta.tone, className)}
      aria-label={meta.label}
      role="img"
    >
      {meta.bars === 0 ? (
        <>
          <rect x="1" y="9" width="3" height="3" rx="1" fill="currentColor" opacity="0.35" />
          <rect x="5.5" y="9" width="3" height="3" rx="1" fill="currentColor" opacity="0.35" />
          <rect x="10" y="9" width="3" height="3" rx="1" fill="currentColor" opacity="0.35" />
        </>
      ) : meta.bars === 4 ? (
        <path
          d="M7 1.5 L12.5 12 H1.5 Z M7 5.5 v3 M7 10 v0.8"
          fill="currentColor"
          stroke="none"
        />
      ) : (
        heights.map((height, index) => (
          <rect
            key={height}
            x={1 + index * 4.5}
            y={12 - height}
            width="3"
            height={height}
            rx="1"
            fill="currentColor"
            opacity={index < meta.bars ? 1 : 0.25}
          />
        ))
      )}
    </svg>
  );
}

export function TypeDot({ type }: { type: 'Feature' | 'Bug' }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        type === 'Bug' ? 'bg-destructive' : 'bg-primary',
      )}
      title={type}
    />
  );
}

export interface MenuOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  hint?: string;
}

interface MenuProps<T extends string> {
  options: MenuOption<T>[];
  value: T | T[] | null;
  onSelect: (value: T) => void;
  trigger: ReactNode;
  align?: 'start' | 'end';
  label?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * A minimal single-select popover. The app mounts inside the portal's shadow
 * root, so this closes on a composed-path outside click rather than on a
 * document target check, which the shadow boundary would retarget.
 */
export function Menu<T extends string>({
  options,
  value,
  onSelect,
  trigger,
  align = 'start',
  label,
  className,
  disabled,
}: MenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = Array.isArray(value) ? value : value === null ? [] : [value];

  // The list scrolls, so an absolutely-positioned panel would be clipped by its
  // scroll container. Measuring the trigger and rendering fixed keeps the panel
  // whole without a DOM portal, which the portal shadow root forbids.
  const place = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const width = 224;
    const maxHeight = 288;
    const height = Math.min(maxHeight, options.length * 30 + 8);
    const left = align === 'end' ? rect.right - width : rect.left;
    const flipsUp = rect.bottom + 4 + height > window.innerHeight - 8;
    setPosition({
      top: flipsUp ? Math.max(8, rect.top - 4 - height) : rect.bottom + 4,
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
    });
  }, [align, options.length]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: Event) => {
      const node = containerRef.current;
      if (!node) return;
      const path = event.composedPath?.() ?? [];
      if (path.includes(node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const reposition = () => setOpen(false);
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) setOpen((current) => !current);
        }}
        className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
      >
        {trigger}
      </button>
      {open && position ? (
        <div
          style={{ position: 'fixed', top: position.top, left: position.left }}
          className="z-50 max-h-72 w-56 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Nothing to pick</p>
          ) : null}
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(option.value);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
            >
              {option.icon ? <span className="flex w-4 justify-center">{option.icon}</span> : null}
              <span className="flex-1 truncate">{option.label}</span>
              {option.hint ? (
                <span className="text-xs text-muted-foreground">{option.hint}</span>
              ) : null}
              {selected.includes(option.value) ? (
                <CheckIcon className="h-3.5 w-3.5 text-muted-foreground" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuCaret() {
  return <CaretDownIcon className="h-3 w-3 shrink-0 text-muted-foreground" />;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            option.value === value
              ? 'bg-background text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
          {typeof option.count === 'number' ? (
            <span className="ml-1.5 text-xs tabular-nums opacity-60">{option.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
