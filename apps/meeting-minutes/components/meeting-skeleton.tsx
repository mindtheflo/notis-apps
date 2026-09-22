function Bone({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-foreground/10 motion-safe:animate-pulse ${className}`} />;
}

export function MeetingListSkeleton({ actions = false }: { actions?: boolean }) {
  return <div role="status" aria-label={actions ? 'Loading action items' : 'Loading meetings'} aria-busy="true" data-meeting-list-skeleton>
    <div aria-hidden="true" className="space-y-2">
      {!actions && <Bone className="mx-2 mb-3 h-3 w-20" />}
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="flex gap-3 rounded-lg px-3 py-3">
        {actions && <Bone className="h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1 space-y-2"><Bone className="h-4 w-3/4" /><Bone className="h-3 w-1/2" />{index % 2 === 0 && <Bone className="h-5 w-20" />}</div>
      </div>)}
    </div>
  </div>;
}

export function MeetingDetailSkeleton({ bodyOnly = false }: { bodyOnly?: boolean }) {
  return <div role="status" aria-label="Loading meeting details" aria-busy="true" data-meeting-detail-skeleton>
    <div aria-hidden="true" className="space-y-8">
      {!bodyOnly && <div className="space-y-4">
        <Bone className="h-8 w-3/4 max-w-xl" />
        <div className="flex flex-wrap gap-4"><Bone className="h-4 w-32" /><Bone className="h-4 w-20" /><Bone className="h-4 w-24" /></div>
        <div className="flex gap-2"><Bone className="h-7 w-24" /><Bone className="h-7 w-24" /></div>
      </div>}
      {Array.from({ length: 3 }, (_, index) => <div key={index} className="space-y-3">
        <Bone className="mb-4 h-5 w-1/3 max-w-48" />
        <Bone className="h-3 w-full" /><Bone className="h-3 w-full" /><Bone className="h-3 w-5/6" /><Bone className="h-3 w-2/3" />
      </div>)}
    </div>
  </div>;
}
