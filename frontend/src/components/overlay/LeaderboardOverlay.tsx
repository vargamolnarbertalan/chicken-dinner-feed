import type { MatchState } from '@cdf/shared';
import { LEADERBOARD_METRICS as M, u } from './overlay-scale';
import { TeamRow } from './TeamRow';

const HEADER_LABELS = ['#', 'TEAM', 'ALIVE', 'PTS', 'ELIMS'] as const;

const LEGEND = [
  { label: 'ALIVE', color: 'var(--player-alive)' },
  { label: 'KNOCKED', color: 'var(--player-knocked)' },
  { label: 'ELIM', color: 'var(--player-dead)' },
] as const;

export interface LeaderboardOverlayProps {
  match: MatchState;
}

/**
 * The team standings panel from `specs/example.png`.
 *
 * Rows are rendered in the order the backend supplies, which is already ranked — the overlay never
 * sorts. Two overlays disagreeing about the standings at the same instant would be a visible defect,
 * so ranking is computed once, server-side (ADR-0007).
 */
export function LeaderboardOverlay({ match }: LeaderboardOverlayProps) {
  return (
    <div
      style={{
        width: u(M.panelWidth),
        backgroundColor: 'var(--overlay-bg)',
        fontFamily: 'var(--overlay-font-family)',
        borderRadius: u(4),
        overflow: 'hidden',
      }}
    >
      <div
        className="grid items-center"
        style={{
          height: u(M.headerHeight),
          paddingInline: u(M.paddingX),
          gridTemplateColumns: `${u(M.rankColumn)} ${u(M.logoColumn)} 1fr ${u(M.aliveColumn)} ${u(M.pointsColumn)} ${u(M.elimsColumn)}`,
          columnGap: u(6),
          backgroundColor: 'var(--overlay-header-bg)',
          color: 'var(--overlay-text)',
          fontSize: u(12),
          letterSpacing: u(0.6),
        }}
      >
        <span className="font-bold">{HEADER_LABELS[0]}</span>
        {/* The logo column has no heading; TEAM spans the name column beside it. */}
        <span />
        <span className="font-bold">{HEADER_LABELS[1]}</span>
        <span className="text-center font-bold">{HEADER_LABELS[2]}</span>
        <span className="text-center font-bold">{HEADER_LABELS[3]}</span>
        <span className="text-center font-bold">{HEADER_LABELS[4]}</span>
      </div>

      <div className="flex flex-col">
        {match.teams.map((team, index) => (
          <TeamRow key={team.teamNo} team={team} isAlternate={index % 2 === 1} />
        ))}
      </div>

      <div
        className="flex items-center justify-center"
        style={{
          height: u(M.legendHeight),
          gap: u(14),
          backgroundColor: 'var(--overlay-header-bg)',
          color: 'var(--overlay-text-muted)',
          fontSize: u(10),
          letterSpacing: u(0.5),
        }}
      >
        {LEGEND.map((entry) => (
          <span key={entry.label} className="flex items-center" style={{ gap: u(5) }}>
            <span
              style={{
                width: u(6),
                height: u(6),
                borderRadius: '50%',
                backgroundColor: entry.color,
              }}
            />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}
