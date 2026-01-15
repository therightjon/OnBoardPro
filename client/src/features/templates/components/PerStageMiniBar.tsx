'use client';
import * as React from 'react';

type Stage = { stageId: string; stageName: string; latestOffsetDays: number; latestDate?: string; phase?: string | null };

// Phase ordering: pre_hire comes before onboarding
const phaseOrder: Record<string, number> = { pre_hire: 0, onboarding: 1 };
const getPhaseOrder = (phase: string | null | undefined): number => 
  phaseOrder[phase ?? ''] ?? 99;

export function PerStageMiniBar({ stages }: { stages: Stage[] }) {
  if (!stages?.length) {
    return <p className="text-sm text-muted-foreground">No stage timing available.</p>;
  }

  const max = Math.max(...stages.map(s => s.latestOffsetDays ?? 0), 1);

  return (
    <div className="space-y-2" role="list" aria-label="Stage duration overview">
      {stages
        .slice()
        .sort((a, b) => {
          // Sort by phase first (pre_hire before onboarding), then by latestOffsetDays
          const phaseCompare = getPhaseOrder(a.phase) - getPhaseOrder(b.phase);
          if (phaseCompare !== 0) return phaseCompare;
          return a.latestOffsetDays - b.latestOffsetDays;
        })
        .map((s) => {
          const pct = Math.max(0, Math.min(100, Math.round((s.latestOffsetDays / max) * 100)));
          return (
            <div key={s.stageId} role="listitem" className="flex items-center gap-3">
              <div className="w-40 shrink-0 text-sm text-foreground truncate" title={s.stageName}>
                <div>{s.stageName}</div>
                {s.phase && (
                  <div className="text-[10px] text-muted-foreground capitalize">{s.phase.replace('_', ' ')}</div>
                )}
              </div>
              <div className="relative h-2 w-full rounded bg-muted">
                <div
                  className="absolute left-0 top-0 h-2 rounded bg-primary"
                  style={{ width: `${pct}%` }}
                  aria-hidden="true"
                />
              </div>
              <div className="w-24 shrink-0 text-right text-muted-foreground text-[12px] font-bold">
                {s.latestOffsetDays ?? 0}d{s.latestDate ? ` · ${new Date(s.latestDate).toLocaleDateString()}` : ''}
              </div>
            </div>
          );
        })}
    </div>
  );
}
