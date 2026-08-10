import type { MatchState, OverlayAppearance } from '@cdf/shared';
import { appearanceToCssVariables } from './appearance';
import { LEADERBOARD_METRICS as M, u } from './overlay-scale';
import { TeamRow } from './TeamRow';

const LEGEND = [
  { label: 'ALIVE', color: 'var(--player-alive)' },
  { label: 'KNOCKED', color: 'var(--player-knocked)' },
  { label: 'ELIM', color: 'var(--player-dead)' },
] as const;

export interface LeaderboardOverlayProps {
  match: MatchState;
  appearance: OverlayAppearance;
}

/**
 * The team standings panel from `specs/example.png`.
 *
 * Rows are rendered in the order the backend supplies, which is already ranked — the overlay never
 * sorts. Two overlays disagreeing about the standings at the same instant would be a visible defect,
 * so ranking is computed once, server-side (ADR-0007).
 */
export function LeaderboardOverlay({ match, appearance }: LeaderboardOverlayProps) {
  const columns = `${u(M.rankColumn)} ${u(M.logoColumn)} 1fr ${u(M.aliveColumn)} ${u(M.pointsColumn)} ${u(M.elimsColumn)}`;
  const teams = match.teams.slice(0, appearance.maxTeams);

  return (
    <div
      style={{
        ...appearanceToCssVariables(appearance),
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
          gridTemplateColumns: columns,
          columnGap: u(6),
          backgroundColor: 'var(--overlay-header-bg)',
          color: 'var(--overlay-text)',
          fontSize: u(12),
          letterSpacing: u(0.6),
        }}
      >
        <span className="font-bold">#</span>
        {/* The logo column has no heading; TEAM labels the name column beside it. */}
        <span />
        <span className="font-bold">TEAM</span>
        <span className="text-center font-bold">ALIVE</span>
        <span className="text-center font-bold">PTS</span>
        <span className="text-center font-bold">ELIMS</span>
      </div>

      <div className="flex flex-col">
        {teams.map((team, index) => (
          <TeamRow key={team.teamNo} team={team} isAlternate={index % 2 === 1} />
        ))}
      </div>

      {appearance.showLegend && (
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
      )}
    </div>
  );
}
