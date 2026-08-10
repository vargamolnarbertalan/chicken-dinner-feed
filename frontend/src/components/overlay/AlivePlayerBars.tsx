import type { Player, PlayerLiveState } from '@cdf/shared';
import { motion } from 'motion/react';
import { LEADERBOARD_METRICS as M, u } from './overlay-scale';

const STATE_COLOR: Record<PlayerLiveState, string> = {
  alive: 'var(--player-alive)',
  knocked: 'var(--player-knocked)',
  dead: 'var(--player-dead)',
  // A player we have not heard about yet must not read as dead — see the domain model.
  unknown: 'var(--player-dead)',
};

const PLAYER_SLOTS = [1, 2, 3, 4] as const;

function fillFraction(player: Player | undefined): number {
  if (!player || player.liveState === 'unknown') return 1;
  if (player.liveState === 'dead') return 0;
  if (player.healthMax <= 0) return 0;
  return Math.max(0, Math.min(1, player.health / player.healthMax));
}

export interface AlivePlayerBarsProps {
  players: readonly Player[];
}

/**
 * One bar per player slot: height is health, colour is state.
 *
 * Slots are fixed 1–4 rather than mapped from the player list, so a given player always occupies
 * the same bar. If bars were indexed by array position, one player dying would shuffle every other
 * bar along and animate the whole group for no reason.
 */
export function AlivePlayerBars({ players }: AlivePlayerBarsProps) {
  const bySlot = new Map(players.map((player) => [player.slot, player]));

  return (
    <div
      className="flex items-end"
      style={{ gap: u(M.barGap), height: u(M.barHeight) }}
      aria-hidden
    >
      {PLAYER_SLOTS.map((slot) => {
        const player = bySlot.get(slot);
        const isDead = player?.liveState === 'dead';
        const fraction = fillFraction(player);

        return (
          <div
            key={slot}
            className="relative overflow-hidden"
            style={{ width: u(M.barWidth), height: u(M.barHeight) }}
          >
            {/*
             * Track: keeps the slot readable once the bar has drained away, so four players always
             * occupy four positions. Kept faint on purpose — at full strength the column reads as a
             * grey block rather than as a row of health bars.
             */}
            <div
              className="absolute inset-0"
              style={{ backgroundColor: 'var(--player-dead)', opacity: 0.28 }}
            />
            <motion.div
              className="absolute right-0 bottom-0 left-0"
              initial={false}
              animate={{
                height: isDead ? u(M.deadBarHeight) : `${fraction * 100}%`,
                backgroundColor: STATE_COLOR[player?.liveState ?? 'unknown'],
              }}
              transition={{
                // Health drains continuously between the ~2 s data points, so it is eased over
                // roughly one upstream tick. Colour snaps: a knock or a death is an event, and
                // fading it would read as a rendering delay rather than as something happening.
                height: { duration: 1.6, ease: 'easeOut' },
                backgroundColor: { duration: 0.12 },
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
