import type { MatchPhase, PlayerLiveState } from '@cdf/shared';
import type { IngestPlayer, IngestUpdate } from '../source.js';
import { createOnceWarner, FieldReader, type FieldWarner } from './field-lookup.js';

/**
 * PCOB's numeric `liveState`, confirmed identically by both vendor documents
 * (`specs/PCOB-API.md` §3).
 *
 * The first four collapse to `alive` because *where* a player is standing — plane, parachute,
 * vehicle — is not something the leaderboard renders. Only whether they are in the fight.
 */
const LIVE_STATE: Record<number, PlayerLiveState> = {
  0: 'alive', // Normal
  1: 'alive', // On Plane
  2: 'alive', // On Parachute
  3: 'alive', // On Vehicle
  4: 'knocked', // DBNO
  5: 'dead',
  6: 'disconnected',
};

/**
 * Field aliases, newest spelling first.
 *
 * ob.js passes the game client's payload through untouched, so these names belong to the game, not
 * to anything we can read in the vendor package. The 3.0.0 dictionary name leads; the 1.5.0 wire
 * sample's spelling follows as a fallback (`specs/PCOB-API.md` §2).
 */
const F = {
  players: ['TotalPlayerList', 'playerInfoList'],
  teams: ['TeamInfoList', 'teamInfoList'],
  gameId: ['GameID', 'gameId'],
  finishedAt: ['FinishedStartTime'],

  playerKey: ['playerKey', 'uId', 'uID'],
  playerName: ['playerName'],
  teamId: ['teamId'],
  health: ['health'],
  healthMax: ['healthMax'],
  liveState: ['liveState'],
  killNum: ['killNum'],
  killNumBeforeDie: ['killNumBeforeDie'],
} as const;

const MAX_TEAM_NO = 25;
const PLAYERS_PER_TEAM = 4;
const DEFAULT_HEALTH_MAX = 100;

/** What one poll gathered. Kept as a plain value so the mapper is testable without any HTTP. */
export interface PcobSnapshot {
  /** The `allinfo` object from `GET /getallinfo`. `{}` before the game has posted anything. */
  allInfo: unknown;
  /** `isInGame` from `GET /isingame`. */
  isInGame: boolean;
}

export interface PcobMapperOptions {
  /** Where field warnings go. Each distinct message is logged once — see `createOnceWarner`. */
  log?: (message: string) => void;
}

/**
 * Turns a PCOB snapshot into our domain's `IngestUpdate`.
 *
 * Holds the small amount of state the wire format does not carry and cannot be recomputed from a
 * single response:
 *
 * - **Slot assignment.** PCOB supplies no player position within a team, and the ALIVE column needs
 *   a stable one (`specs/PCOB-API.md` §7.2).
 * - **Kill high-water marks.** `killNum` versus `killNumBeforeDie` behaviour after death is not
 *   documented, so we keep the maximum ever seen.
 *
 * Both are per match and are dropped when `GameID` changes.
 */
export class PcobMapper {
  private readonly warn: FieldWarner;

  private matchId: string | null = null;
  /** teamNo → (playerId → slot). Assignment order is arrival order, then frozen. */
  private readonly slots = new Map<number, Map<string, number>>();
  /** playerId → highest kill count seen this match. */
  private readonly maxKills = new Map<string, number>();

  constructor(options: PcobMapperOptions = {}) {
    const log = options.log ?? (() => {});
    this.warn = createOnceWarner(log).warn;
  }

  map(snapshot: PcobSnapshot): IngestUpdate {
    const root = new FieldReader(snapshot.allInfo, this.warn);

    const gameId = root.has(F.gameId) ? root.string(F.gameId, '') : '';
    const matchId = gameId === '' ? null : gameId;

    // A new game invalidates both pieces of retained state. MatchStore separately resets its
    // elimination history on the same signal, so placement points cannot leak across matches.
    if (matchId !== this.matchId) {
      this.matchId = matchId;
      this.slots.clear();
      this.maxKills.clear();
    }

    const players = this.mapPlayers(root.raw(F.players));

    return {
      matchId,
      phase: derivePhase(root, snapshot.isInGame, players.length),
      players,
    };
  }

  private mapPlayers(raw: unknown): IngestPlayer[] {
    if (!Array.isArray(raw)) {
      // Not a warning: before the observer joins a room the list is legitimately absent, and that
      // is the normal state for most of the time the app is running.
      return [];
    }

    const players: IngestPlayer[] = [];

    for (const entry of raw) {
      const reader = new FieldReader(entry, this.warn, 'player');

      const teamNo = reader.number(F.teamId, 0);
      if (!Number.isInteger(teamNo) || teamNo < 1 || teamNo > MAX_TEAM_NO) {
        this.warn(`player has teamId ${teamNo}, outside 1–${MAX_TEAM_NO}; skipped`);
        continue;
      }

      // playerKey is the identifier the vendor's own cross-endpoint joins use, so it leads. Falling
      // back to the name keeps a player renderable even if every id field is missing — two players
      // sharing a name is a cosmetic fault, dropping them from the table is not.
      const id = reader.string(F.playerKey, '');
      const name = reader.string(F.playerName, '');
      const stableId = id !== '' ? id : name;
      if (stableId === '') {
        this.warn('player has neither an id nor a name; skipped');
        continue;
      }

      const slot = this.slotFor(teamNo, stableId);
      if (slot === null) continue;

      const healthMax = reader.number(F.healthMax, DEFAULT_HEALTH_MAX);

      players.push({
        id: stableId,
        name: name !== '' ? name : stableId,
        teamNo,
        slot,
        liveState: this.liveStateFor(reader),
        health: Math.max(0, reader.number(F.health, 0)),
        // A zero or negative maximum would make the bar's fraction meaningless, and healthMax is
        // the denominator everywhere downstream.
        healthMax: healthMax > 0 ? healthMax : DEFAULT_HEALTH_MAX,
        kills: this.killsFor(stableId, reader),
      });
    }

    return players;
  }

  private liveStateFor(reader: FieldReader): PlayerLiveState {
    const raw = reader.number(F.liveState, -1);
    const mapped = LIVE_STATE[raw];
    if (mapped) return mapped;

    // A value outside 0–6 means the game added a state we have not seen. `unknown` renders the
    // player as present-but-unreported rather than guessing at dead.
    this.warn(`liveState ${raw} is not a known PCOB value; treating as unknown`);
    return 'unknown';
  }

  /**
   * Kills, as a high-water mark for the match.
   *
   * PCOB exposes `killNum` and `killNumBeforeDie` separately, and what `killNum` does after a player
   * dies is undocumented — it may hold, or it may reset to zero with the real figure moved into
   * `killNumBeforeDie` (which the 1.5.0 sample does not even contain). Taking the maximum makes the
   * count monotonic under every one of those behaviours. A team's elimination total visibly going
   * *down* mid-broadcast is the failure this prevents, and it would be blamed on us.
   */
  private killsFor(playerId: string, reader: FieldReader): number {
    const current = Math.max(0, reader.number(F.killNum, 0));
    const beforeDeath = reader.has(F.killNumBeforeDie)
      ? Math.max(0, reader.number(F.killNumBeforeDie, 0))
      : 0;

    const best = Math.max(current, beforeDeath, this.maxKills.get(playerId) ?? 0);
    this.maxKills.set(playerId, best);
    return best;
  }

  /**
   * The player's bar position, assigned on first sight and then fixed.
   *
   * Arrival order decides the initial layout, on the reasoning that the order the game emits is
   * most likely its own team order, so the bars match what a caster sees in-game. Freezing by id is
   * what keeps it stable afterwards: a player missing from one response leaves their slot **empty**
   * instead of letting teammates slide up a place and back down two seconds later
   * (`specs/PCOB-API.md` §7.2).
   *
   * @returns the slot, or null if the team already has four players and this one cannot be shown.
   */
  private slotFor(teamNo: number, playerId: string): number | null {
    let team = this.slots.get(teamNo);
    if (!team) {
      team = new Map();
      this.slots.set(teamNo, team);
    }

    const existing = team.get(playerId);
    if (existing !== undefined) return existing;

    if (team.size >= PLAYERS_PER_TEAM) {
      this.warn(`team ${teamNo} has more than ${PLAYERS_PER_TEAM} players; extras are not shown`);
      return null;
    }

    const slot = team.size + 1;
    team.set(playerId, slot);
    return slot;
  }
}

/**
 * Which phase the match is in.
 *
 * `isInGame` is the signal ob.js actually serves, and it is the one we trust. `FinishedStartTime` —
 * documented as the moment WWCD appears — refines it when present, because a match that has ended
 * but whose room is still open should not keep reading as live. Only source B documents that field,
 * so its absence is expected rather than exceptional and simply leaves `isInGame` in charge.
 */
function derivePhase(root: FieldReader, isInGame: boolean, playerCount: number): MatchPhase {
  const finishedAt = root.has(F.finishedAt) ? root.string(F.finishedAt, '') : '';
  if (finishedAt !== '') return 'ended';
  if (isInGame) return 'live';

  // Not in a game but players are still being reported: the match just ended and the payload has
  // not been cleared. Reporting `idle` here would make MatchStore drop the final standings.
  return playerCount > 0 ? 'ended' : 'idle';
}
