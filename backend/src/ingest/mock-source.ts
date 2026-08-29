import type { IngestSourceKind, MatchPhase, TeamRosterEntry } from '@cdf/shared';
import { DEFAULT_TEAM_ROSTER } from '@cdf/shared';
import type { IngestPlayer, IngestSource, IngestSourceEvents } from './source.js';

export interface MockSourceOptions {
  roster?: readonly TeamRosterEntry[];
  /** Matches the real upstream cadence of ~2 s, so timing-related bugs surface in development. */
  tickMs?: number;
  /** Fixed seed keeps runs reproducible, which matters when tuning overlay animations. */
  seed?: number;
}

/** Everything the simulation tracks that the wire format does not carry. */
interface SimPlayer extends IngestPlayer {
  /** Who knocked this player, so a bleed-out is credited to them and not to nobody. */
  knockedBy: string | null;
}

const PLAYERS_PER_TEAM = 4;
const IDLE_TICKS = 2;
const ENDED_TICKS = 5;
const KNOCK_HEALTH = 40;
const BLEED_PER_TICK = 12;

/**
 * Pacing.
 *
 * A real match runs 25–30 minutes; at a 2 s tick that is ~800 ticks, which is far too slow to
 * develop an overlay against — you would wait ten minutes to see a rank change animate. These
 * numbers compress a full sixteen-team arc into roughly 90 seconds.
 *
 * Engagements escalate with time so the match always converges. Without escalation, healing and
 * revives can out-pace damage and the simulation stalls in a stalemate with everyone at full health,
 * which is exactly what the first version did.
 */
const BASE_ENGAGEMENTS = 3;
const ENGAGEMENT_ESCALATION_TICKS = 6;
const MAX_ENGAGEMENTS = 12;
const MIN_DAMAGE = 25;
const DAMAGE_SPREAD = 35;
const HEAL_CHANCE = 0.06;
const HEAL_AMOUNT = 18;
const REVIVE_CHANCE = 0.25;
/** Per alive player per tick. Rare enough to stay a curiosity rather than a distraction. */
const DISCONNECT_CHANCE = 0.004;
/** Per disconnected player per tick — they come back quickly, as they usually do. */
const RECONNECT_CHANCE = 0.3;

/** Deterministic PRNG (mulberry32) — `Math.random()` would make animation work unrepeatable. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Still in the fight.
 *
 * Matches the predicate the real pipeline uses (`scoring/standings.ts`): knocked players can be
 * revived and disconnected ones can reconnect, so neither is eliminated. Keeping the two in step
 * matters — if the mock counted a disconnected player as out, a team could be "eliminated" here in
 * a way the real adapter would never produce, and the placement logic would be exercised wrongly.
 */
function isStanding(player: SimPlayer): boolean {
  return (
    player.liveState === 'alive' ||
    player.liveState === 'knocked' ||
    player.liveState === 'disconnected'
  );
}

/**
 * A scripted match that behaves enough like a real one to build against.
 *
 * This exists because the PCOB payload shape is unknown and there is no way into a live match yet
 * (ADR-0006, specs/PCOB-FINDINGS.md). It is not throwaway scaffolding: deterministic, repeatable
 * match data is what makes overlay animation work tractable, and it doubles as a rehearsal mode for
 * operators who want to check their setup without a game running.
 *
 * The field names it produces are the ones we have actually confirmed — health, healthMax, live
 * state, kills, team number — rather than a comfortable invention, so the eventual real adapter has
 * less chance of invalidating the domain model.
 */
export class MockSource implements IngestSource {
  readonly kind: IngestSourceKind = 'mock';

  private roster: readonly TeamRosterEntry[];
  private readonly tickMs: number;
  private readonly rng: () => number;

  private events: IngestSourceEvents | null = null;
  private timer: NodeJS.Timeout | null = null;

  private players: SimPlayer[] = [];
  private phase: MatchPhase = 'idle';
  private ticksInPhase = 0;
  private matchNumber = 0;

  constructor(options: MockSourceOptions = {}) {
    this.roster = options.roster ?? DEFAULT_TEAM_ROSTER.teams;
    this.tickMs = options.tickMs ?? 2000;
    this.rng = createRng(options.seed ?? 20260809);
  }

  /**
   * Rehearse against whichever roster the operator has actually configured (imported from an ini,
   * say) instead of the built-in stand-in names. Applied on the next `resetMatch()` — the match
   * already in progress keeps its current player list rather than reshuffling mid-fight.
   */
  setRoster(roster: readonly TeamRosterEntry[]): void {
    this.roster = roster;
  }

  start(events: IngestSourceEvents): void {
    this.events = events;
    events.onStatus('connecting', 'Starting the mock match source');

    this.resetMatch();
    events.onStatus('connected', 'Mock source — no game required');
    this.emit();

    this.timer ??= setInterval(() => this.tick(), this.tickMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.events?.onStatus('disconnected', 'Mock source stopped');
    this.events = null;
  }

  private tick(): void {
    this.ticksInPhase += 1;

    switch (this.phase) {
      case 'idle':
        if (this.ticksInPhase >= IDLE_TICKS) this.enterPhase('live');
        break;
      case 'live':
        this.simulateCombat();
        if (this.standingTeamCount() <= 1) this.enterPhase('ended');
        break;
      case 'ended':
        if (this.ticksInPhase >= ENDED_TICKS) this.resetMatch();
        break;
    }

    this.emit();
  }

  private enterPhase(phase: MatchPhase): void {
    this.phase = phase;
    this.ticksInPhase = 0;
  }

  private resetMatch(): void {
    this.matchNumber += 1;
    this.phase = 'idle';
    this.ticksInPhase = 0;
    this.players = this.roster.flatMap((team) =>
      Array.from({ length: PLAYERS_PER_TEAM }, (_unused, index) => ({
        id: `${team.teamNo}-${index + 1}`,
        name: `${team.name}_${index + 1}`,
        teamNo: team.teamNo,
        slot: index + 1,
        liveState: 'alive' as const,
        health: 100,
        healthMax: 100,
        kills: 0,
        // The mock has no separate ground truth to leak — its own elimination order is exactly what
        // MatchStore's fallback would otherwise derive from PCOB's `rank`, so this stays 0 always.
        rank: 0,
        knockedBy: null,
      })),
    );
  }

  private simulateCombat(): void {
    this.simulateDropouts();
    this.bleedKnockedPlayers();
    this.reviveSomeKnockedPlayers();
    this.runEngagements();
    this.healSomeSurvivors();
  }

  /**
   * Occasional disconnects and reconnects.
   *
   * PCOB reports `liveState: 6` for a player who has dropped out, and the overlay renders that
   * differently from both alive and dead. Without this, that rendering could not be seen at all
   * before a real tournament — the state would ship untested and unlooked-at, which is exactly the
   * "looks finished and is wrong" outcome the mock source exists to prevent.
   *
   * Rates are deliberately low: a disconnect every few minutes is realistic, and a stream of them
   * would make the mock unusable for judging anything else.
   */
  private simulateDropouts(): void {
    for (const player of this.players) {
      if (player.liveState === 'alive' && this.rng() < DISCONNECT_CHANCE) {
        player.liveState = 'disconnected';
        continue;
      }
      // Reconnecting returns them at whatever health they left with, which is what the game does.
      if (player.liveState === 'disconnected' && this.rng() < RECONNECT_CHANCE) {
        player.liveState = 'alive';
      }
    }
  }

  private bleedKnockedPlayers(): void {
    for (const player of this.players) {
      if (player.liveState !== 'knocked') continue;

      player.health = Math.max(0, player.health - BLEED_PER_TICK);
      if (player.health === 0) this.kill(player, player.knockedBy);
    }
  }

  private reviveSomeKnockedPlayers(): void {
    for (const player of this.players) {
      if (player.liveState !== 'knocked') continue;

      const hasHelp = this.players.some(
        (mate) =>
          mate.teamNo === player.teamNo && mate.id !== player.id && mate.liveState === 'alive',
      );
      if (!hasHelp || this.rng() > REVIVE_CHANCE) continue;

      player.liveState = 'alive';
      player.health = 30;
      player.knockedBy = null;
    }
  }

  private runEngagements(): void {
    const engagements = Math.min(
      MAX_ENGAGEMENTS,
      BASE_ENGAGEMENTS + Math.floor(this.ticksInPhase / ENGAGEMENT_ESCALATION_TICKS),
    );

    for (let i = 0; i < engagements; i += 1) {
      const attacker = this.pickRandom(this.players.filter((p) => p.liveState === 'alive'));
      if (!attacker) return;

      const target = this.pickRandom(
        this.players.filter((p) => isStanding(p) && p.teamNo !== attacker.teamNo),
      );
      // No opponents left standing — the match is over, nothing more to simulate this tick.
      if (!target) return;

      this.applyDamage(attacker, target, MIN_DAMAGE + Math.floor(this.rng() * DAMAGE_SPREAD));
    }
  }

  private applyDamage(attacker: SimPlayer, target: SimPlayer, damage: number): void {
    if (target.liveState === 'knocked') {
      // Finishing a knocked opponent credits the elimination to whoever finished them.
      this.kill(target, attacker.id);
      return;
    }

    target.health -= damage;
    if (target.health > 0) return;

    const teammatesStanding = this.players.some(
      (mate) => mate.teamNo === target.teamNo && mate.id !== target.id && isStanding(mate),
    );

    if (teammatesStanding) {
      // With a teammate left, a downed player is knocked and can still be revived.
      target.liveState = 'knocked';
      target.health = KNOCK_HEALTH;
      target.knockedBy = attacker.id;
    } else {
      // Last player standing on the team — no knock, straight elimination.
      this.kill(target, attacker.id);
    }
  }

  private kill(target: SimPlayer, killerId: string | null): void {
    target.liveState = 'dead';
    target.health = 0;
    target.knockedBy = null;

    if (!killerId) return;
    const killer = this.players.find((player) => player.id === killerId);
    if (killer) killer.kills += 1;
  }

  private healSomeSurvivors(): void {
    for (const player of this.players) {
      if (player.liveState !== 'alive') continue;
      if (player.health >= player.healthMax) continue;
      if (this.rng() > HEAL_CHANCE) continue;

      player.health = Math.min(player.healthMax, player.health + HEAL_AMOUNT);
    }
  }

  private standingTeamCount(): number {
    return new Set(this.players.filter(isStanding).map((player) => player.teamNo)).size;
  }

  private pickRandom<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[Math.floor(this.rng() * items.length)];
  }

  private emit(): void {
    this.events?.onUpdate({
      matchId: `mock-match-${this.matchNumber}`,
      phase: this.phase,
      // Strip simulation-only fields rather than letting them leak onto the wire.
      players: this.players.map(({ knockedBy: _unused, ...player }) => player),
    });
  }
}
