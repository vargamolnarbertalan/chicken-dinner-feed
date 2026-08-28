import type { Team } from '@cdf/shared';
import { motion } from 'motion/react';
import { AlivePlayerBars } from './AlivePlayerBars';
import { LEADERBOARD_METRICS as M, u } from './overlay-scale';

export interface TeamRowProps {
  team: Team;
  isAlternate: boolean;
}

/** A number that draws attention to itself when it changes, without moving the layout. */
function CountingValue({ value }: { value: number }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0.4, scale: 1.35 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="inline-block tabular-nums"
    >
      {value}
    </motion.span>
  );
}

export function TeamRow({ team, isAlternate }: TeamRowProps) {
  return (
    <motion.div
      // `layout` is what animates a team physically sliding past another as the standings change.
      // It is the single most visible piece of motion in the overlay.
      layout
      transition={{ layout: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } }}
      className="grid items-center"
      style={{
        height: u(M.rowHeight),
        paddingInline: u(M.paddingX),
        gridTemplateColumns: `${u(M.rankColumn)} ${u(M.logoColumn)} 1fr ${u(M.aliveColumn)} ${u(M.pointsColumn)} ${u(M.elimsColumn)}`,
        columnGap: u(6),
        backgroundColor: isAlternate ? 'var(--overlay-row-alt-bg)' : 'transparent',
        // Eliminated teams recede rather than disappear — the director still needs to see where a
        // team finished. A team that has never actually shown up this match recedes further still:
        // it is a roster slot nobody has played, not a competitor, and must read as visibly
        // different from "alive, just no data yet" (which renders identically otherwise — full,
        // undimmed bars — see AlivePlayerBars' `fillFraction`).
        opacity: !team.hasAppeared ? 0.25 : team.isEliminated ? 0.45 : 1,
        transition: 'opacity 400ms ease',
      }}
    >
      <span
        className="font-semibold tabular-nums"
        style={{ fontSize: u(17), color: 'var(--overlay-text)' }}
      >
        {team.rank}
      </span>

      <div className="flex items-center justify-center" style={{ height: u(M.logoColumn) }}>
        {team.logoUrl ? (
          <img
            src={team.logoUrl}
            alt=""
            style={{ width: u(M.logoColumn), height: u(M.logoColumn) }}
          />
        ) : (
          // Placeholder until team logos are configurable, so the column keeps its width and the
          // layout does not shift when logos arrive.
          <div
            style={{
              width: u(M.logoColumn - 6),
              height: u(M.logoColumn - 6),
              borderRadius: u(3),
              backgroundColor: 'var(--overlay-row-alt-bg)',
              border: `${u(1)} solid var(--overlay-text-muted)`,
              opacity: 0.5,
            }}
          />
        )}
      </div>

      <span
        className="truncate font-bold tracking-wide"
        style={{ fontSize: u(16), color: 'var(--overlay-text)' }}
      >
        {team.name}
      </span>

      <div className="flex justify-center">
        <AlivePlayerBars players={team.players} />
      </div>

      <span
        className="text-center font-semibold"
        style={{ fontSize: u(16), color: 'var(--overlay-text)' }}
      >
        <CountingValue value={team.totalPoints} />
      </span>

      <span
        className="text-center font-semibold"
        style={{ fontSize: u(16), color: 'var(--overlay-text)' }}
      >
        <CountingValue value={team.eliminations} />
      </span>
    </motion.div>
  );
}
