'use client';

import { ArrowSquareOutIcon, ArrowUpRightIcon, ArrowDownLeftIcon, CircleDashedIcon } from '@phosphor-icons/react';
import type { SkillGraph, SkillLink } from '@/lib/skill-links';
import { LINK_KIND_LABEL } from '@/lib/skill-links';
import { clusterColor, neighbourhood, nodeMap } from '@/lib/graph-view';
import { skillEditorUrl } from '@/lib/skills-api';
import { Badge } from '@/components/ui/badge';

interface SkillDetailProps {
  graph: SkillGraph;
  skillId: string;
  onSelect: (skillId: string) => void;
}

/** One side of a skill's neighbourhood, with the lines that prove each link. */
function LinkList({
  title,
  icon,
  links,
  direction,
  graph,
  onSelect,
}: {
  title: string;
  icon: React.ReactNode;
  links: SkillLink[];
  direction: 'outgoing' | 'incoming';
  graph: SkillGraph;
  onSelect: (skillId: string) => void;
}) {
  const nodes = nodeMap(graph);

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {title}
        <span className="text-muted-foreground/70">({links.length})</span>
      </h3>

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">None found.</p>
      ) : (
        <ul className="space-y-1">
          {links.map((link) => {
            const otherId = direction === 'outgoing' ? link.targetId : link.sourceId;
            const other = nodes.get(otherId);
            if (!other) return null;

            return (
              <li key={`${link.sourceId}->${link.targetId}`} className="list-row">
                <button
                  type="button"
                  onClick={() => onSelect(otherId)}
                  className="flex w-full min-w-0 items-center gap-2 text-left text-sm font-medium text-foreground hover:underline"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: clusterColor(other.cluster) }}
                    aria-hidden
                  />
                  <span className="truncate">{other.name}</span>
                </button>

                <p className="mt-1 text-xs text-muted-foreground">
                  {LINK_KIND_LABEL[link.evidence[0].kind]}
                  {link.mentions > 1 ? ` · ${link.mentions} mentions` : ''}
                </p>

                <ul className="mt-1.5 space-y-1">
                  {link.evidence.slice(0, 3).map((item, index) => (
                    <li
                      key={`${item.kind}-${index}`}
                      className="pl-3 text-xs leading-relaxed text-muted-foreground"
                    >
                      {item.snippet}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function SkillDetail({ graph, skillId, onSelect }: SkillDetailProps) {
  const node = graph.nodes.find((item) => item.id === skillId);
  const view = neighbourhood(graph, skillId);
  if (!node) return null;

  const isolated = node.incoming + node.outgoing === 0;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4" data-store-screenshot="detail">
      <header className="space-y-2">
        <div className="flex items-start gap-2">
          <span
            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: clusterColor(node.cluster) }}
            aria-hidden
          />
          <h2 className="text-base font-semibold leading-tight text-foreground">{node.name}</h2>
        </div>

        {node.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{node.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{node.isCurated ? 'Curated' : 'Custom'}</Badge>
          <span className={isolated ? 'text-foreground' : undefined}>
            {isolated ? 'No links' : `${node.outgoing} out · ${node.incoming} in`}
          </span>
          <span className="text-muted-foreground/60">·</span>
          <a
            href={skillEditorUrl(node.id)}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Open skill
            <ArrowSquareOutIcon size={11} />
          </a>
        </div>
      </header>

      {isolated ? (
        <p className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          <CircleDashedIcon size={16} className="mt-0.5 shrink-0" />
          Nothing references this skill and it references nothing. Name it inside another skill&apos;s
          instructions to wire it into a chain.
        </p>
      ) : (
        <>
          <LinkList
            title="References"
            icon={<ArrowUpRightIcon size={13} />}
            links={view.outgoing}
            direction="outgoing"
            graph={graph}
            onSelect={onSelect}
          />
          <LinkList
            title="Referenced by"
            icon={<ArrowDownLeftIcon size={13} />}
            links={view.incoming}
            direction="incoming"
            graph={graph}
            onSelect={onSelect}
          />
        </>
      )}
    </div>
  );
}
