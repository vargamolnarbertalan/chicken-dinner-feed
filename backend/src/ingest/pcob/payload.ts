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
 * The raw `liveState` values that mean a player is in the air on the way in — the round has started.
 *
 * Captured from a real tournament lobby (`specs/PCOB-API.md` §8): during warmup every one of 51
 * players reported `liveState: 0` at a scattered ground position; the moment the plane launched all
 * 52 reported `liveState: 1` at one shared coordinate 1500 m up. A whole-lobby transition like that
 * has no plausible false positive, which is what makes it usable as the "this is real now" signal.
 */
const IN_FLIGHT_STATES = new Set([1, 2]); // On Plane, On Parachute.

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
  rank: ['rank'],
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
 * - **A kill baseline**, netted against the high-water mark above, so nothing scored before the
 *   round is judged to have started (warmup, most likely) reaches the scoreboard — see
 *   `killBaseline`.
 *
 * All three are per match and are dropped when `GameID` changes.
 */
export class PcobMapper {
  private readonly warn: FieldWarner;

  private matchId: string | null = null;
  /** teamNo → (playerId → slot). Assignment order is arrival order, then frozen. */
  private readonly slots = new Map<number, Map<string, number>>();
  /** playerId → highest raw kill count seen this match — never itself reduced, see `killsFor`. */
  private readonly maxKills = new Map<string, number>();
  /**
   * playerId → the raw high-water mark at the instant the round was judged to have started.
   *
   * Subtracted from every reading afterwards, so anything scored before that instant — on the
   * warmup island, if it turns out to register there at all — cannot reach the scoreboard. A plain
   * `maxKills.clear()` would not do this: `killsFor` takes the *maximum* of the cache and the API's
   * own current reading, so if PCOB's own `killNum` carries a warmup kill into the round under the
   * same `GameID` (unconfirmed, `specs/PCOB-API.md` §8), the API's value would win regardless of
   * what our cache remembers. An offset is the only thing that actually zeroes it out either way.
   */
  private readonly killBaseline = new Map<string, number>();
  /**
   * Latched once the round has started, and never unlatched for the same match: players leave the
   * air within seconds of the drop, so the in-flight signal is a starting gun, not a state to poll.
   */
  private started = false;

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
      this.killBaseline.clear();
      this.started = false;
    }

    const players = this.mapPlayers(root.raw(F.players));

    // An empty lobby unlatches it as well as a new match id does. `GameID` is the signal §7.6 is
    // built on, but it comes from `getallinfo` and its absence is a documented possibility — with no
    // id ever changing, the latch would otherwise survive from the first round of the day to the
    // last and let every later warmup through.
    if (players.length === 0) {
      this.started = false;
    } else if (!this.started && this.sawFlight) {
      // The plane is a precise instant: everyone in one poll, at the ground, the next, in the air.
      // Crossing it *is* leaving warmup, so this is exactly when a baseline belongs — see
      // `killBaseline`. Snapshot taken from `maxKills` as it stands after this same tick's
      // `mapPlayers` call above: "whatever each player had accumulated through this instant." This
      // tick's own returned `players` still carries the pre-baseline (potentially inflated) reading;
      // fixing that costs detecting the signal before scoring runs at all, for one poll interval
      // (~1s) of exposure that self-corrects immediately, and can never reach the series history
      // either way — no map closes during warmup, automatically or by hand.
      this.started = true;
      for (const [playerId, killsSoFar] of this.maxKills) {
        this.killBaseline.set(playerId, killsSoFar);
      }
    } else if (!this.started && hasRoundStartedByFallback(players)) {
      // The recovery path: the app started, or reconnected, after the plane had already flown, so
      // there was no instant to snapshot a baseline against. Deliberately does not set one — every
      // reading kept in `maxKills` up to now came from an already-live round in this branch (the
      // signal is `rank`, which warmup has no equivalent of), so it is not warmup contamination to
      // net out. Baselining it anyway would erase whatever the team had genuinely earned between
      // this match's true start and the moment this fallback caught up with it.
      this.started = true;
    }

    const inWarmup = players.length > 0 && !this.started;

    return {
      matchId,
      phase: derivePhase(root, snapshot.isInGame, players, inWarmup),
      players,
      inWarmup,
    };
  }

  /** Set by `mapPlayers` for the poll it is mapping — see `IN_FLIGHT_STATES`. */
  private sawFlight = false;

  private mapPlayers(raw: unknown): IngestPlayer[] {
    this.sawFlight = false;
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

      const rawLiveState = reader.number(F.liveState, -1);
      if (IN_FLIGHT_STATES.has(rawLiveState)) this.sawFlight = true;

      players.push({
        id: stableId,
        name: name !== '' ? name : stableId,
        teamNo,
        slot,
        liveState: this.liveStateFor(rawLiveState),
        health: Math.max(0, reader.number(F.health, 0)),
        // A zero or negative maximum would make the bar's fraction meaningless, and healthMax is
        // the denominator everywhere downstream.
        healthMax: healthMax > 0 ? healthMax : DEFAULT_HEALTH_MAX,
        kills: this.killsFor(stableId, reader),
        rank: this.rankFor(reader),
      });
    }

    return players;
  }

  private liveStateFor(raw: number): PlayerLiveState {
    const mapped = LIVE_STATE[raw];
    if (mapped) return mapped;

    // A value outside 0–6 means the game added a state we have not seen. `unknown` renders the
    // player as present-but-unreported rather than guessing at dead.
    this.warn(`liveState ${raw} is not a known PCOB value; treating as unknown`);
    return 'unknown';
  }

  /**
   * The team's placement per PCOB's own `rank` field. `0` means "still playing"
   * (`specs/PCOB-API.md` §6); never let a malformed value read as a false placement.
   *
   * Truncated to an integer defensively: this value flows straight into `Team.placement`
   * downstream, which is schema-typed as an integer. A fractional value here would fail that
   * schema on the way out over the WebSocket, and the client drops a message that fails schema
   * validation with no visible error — silently freezing the overlay on its last good frame for the
   * rest of the match, exactly the failure mode ADR-0006 exists to prevent.
   */
  private rankFor(reader: FieldReader): number {
    const raw = reader.number(F.rank, 0);
    const truncated = Math.max(0, Math.trunc(raw));
    if (truncated !== raw) this.warn(`rank ${raw} is not an integer; using ${truncated}`);
    return truncated;
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

    // The raw high-water mark is tracked unconditionally, on the API's own numbers — never itself
    // reduced by the baseline below, or a mid-match baseline update would corrupt it.
    const best = Math.max(current, beforeDeath, this.maxKills.get(playerId) ?? 0);
    this.maxKills.set(playerId, best);

    // See `killBaseline`. Zero for a player never seen before the round started, which is correct:
    // there is nothing of theirs to net out.
    return Math.max(0, best - (this.killBaseline.get(playerId) ?? 0));
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
 * The fallback signal for "the round has started", for when the plane cannot answer: the app
 * started, or reconnected, after everyone had already landed.
 *
 * `rank` only, deliberately, not kills or a dead/knocked state. PUBG Mobile's warmup island is a
 * real pre-drop practice area where players can shoot and knock each other, so any of those three
 * can happen *during* warmup itself — using them here would let warmup PvP trigger this exact
 * signal, the opposite of what it exists to detect. `rank` is different in kind: it is a team's
 * placement in the battle-royale round proper, a concept warmup has no equivalent of, so its
 * presence is not contaminated the same way.
 *
 * Deliberately kept separate from the flight signal at the call site, not folded into one combined
 * check: the two answer different questions. Seeing the plane means *this instant* is the boundary,
 * which is exactly when a kill baseline belongs (see `killBaseline`). This fallback only means the
 * round is *already* past its start by an unknown amount — baselining against it would erase
 * whatever a team had genuinely earned between the round's true start and however late this signal
 * happened to catch up.
 */
function hasRoundStartedByFallback(players: readonly IngestPlayer[]): boolean {
  return players.some((player) => player.rank > 0);
}

/**
 * How many distinct teams still have a standing player — the same predicate `MatchStore` and
 * `standings.ts` use for "still in the fight" (knocked and disconnected both count; only dead does
 * not).
 */
function standingTeamCount(players: readonly IngestPlayer[]): number {
  const standing = new Set<number>();
  for (const player of players) {
    if (player.liveState === 'alive' || player.liveState === 'knocked' || player.liveState === 'disconnected') {
      standing.add(player.teamNo);
    }
  }
  return standing.size;
}

/**
 * Whether the round has *actually* concluded, as opposed to a metadata field claiming it has.
 *
 * Found live, on the same tournament match this file's warmup detection was built for: `ended` (via
 * either signal below) fired while 11 of 13 teams were still fighting, and every one of them was
 * immediately handed a full, final placement — 1st through 13th, real points, hours before any of
 * it was true. §7.6 assumed both signals reset per match; at least one of them, in practice, did
 * not. A battle royale round structurally has at most one team with any player left standing when
 * it is genuinely over (WWCD) — a fact about the game, not about either field's behaviour — so that
 * is now required in addition to whichever signal fires, and is what actually caught the failure.
 */
function derivePhase(
  root: FieldReader,
  isInGame: boolean,
  players: readonly IngestPlayer[],
  inWarmup: boolean,
): MatchPhase {
  if (inWarmup) return 'live';

  const roundCouldHaveConcluded = standingTeamCount(players) <= 1;

  const finishedAt = root.has(F.finishedAt) ? root.string(F.finishedAt, '') : '';
  if (finishedAt !== '' && players.length > 0 && roundCouldHaveConcluded) return 'ended';
  if (isInGame) return 'live';

  // No players at all: nothing to report either way. Distinct from the "players present but the
  // standings disagree it has ended" case just below — that one is `live`, not `idle`, so as not to
  // make MatchStore drop tracking for a match that is demonstrably still going.
  if (players.length === 0) return 'idle';

  // Not in a game but players are still being reported: the match just ended and the payload has
  // not been cleared. Reporting `idle` here would make MatchStore drop the final standings. But
  // only when the standings themselves agree the round could really be over — `isInGame` flipping
  // false for one poll during real, ongoing combat must not read as the match having concluded.
  return roundCouldHaveConcluded ? 'ended' : 'live';
}
