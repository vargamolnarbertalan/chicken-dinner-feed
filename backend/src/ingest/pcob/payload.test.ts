import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PcobMapper, type PcobSnapshot } from './payload.js';

/** One player as the game posts it, using the 3.0.0 spellings. */
function player(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    playerKey: 1253582361,
    playerName: 'PlayerNo101',
    teamId: 1,
    health: 100,
    healthMax: 100,
    liveState: 0,
    killNum: 0,
    ...overrides,
  };
}

function snapshot(
  players: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
  isInGame = true,
): PcobSnapshot {
  return {
    allInfo: { TotalPlayerList: players, GameID: 'room-1', ...extra },
    isInGame,
  };
}

describe('PcobMapper', () => {
  describe('liveState', () => {
    it.each([
      [0, 'alive'],
      [1, 'alive'],
      [2, 'alive'],
      [3, 'alive'],
      [4, 'knocked'],
      [5, 'dead'],
      [6, 'disconnected'],
    ])('maps PCOB %i to %s', (raw, expected) => {
      const update = new PcobMapper().map(snapshot([player({ liveState: raw })]));

      expect(update.players[0]?.liveState).toBe(expected);
    });

    it('treats an unrecognised value as unknown rather than guessing at dead', () => {
      // A future game version adding a state must not make the overlay declare someone eliminated.
      const warnings: string[] = [];
      const mapper = new PcobMapper({ log: (m) => warnings.push(m) });

      const update = mapper.map(snapshot([player({ liveState: 99 })]));

      expect(update.players[0]?.liveState).toBe('unknown');
      expect(warnings.join(' ')).toContain('liveState 99');
    });
  });

  describe('slot assignment', () => {
    it('assigns slots in arrival order', () => {
      const update = new PcobMapper().map(
        snapshot([
          player({ playerKey: 30, playerName: 'C' }),
          player({ playerKey: 10, playerName: 'A' }),
          player({ playerKey: 20, playerName: 'B' }),
        ]),
      );

      expect(update.players.map((p) => [p.name, p.slot])).toEqual([
        ['C', 1],
        ['A', 2],
        ['B', 3],
      ]);
    });

    it('keeps a slot empty when a player is missing from one response', () => {
      // The on-air failure this exists to prevent: teammates must not slide up a place and back
      // down two seconds later because one player was absent from a single poll.
      const mapper = new PcobMapper();
      const all = [
        player({ playerKey: 10, playerName: 'A' }),
        player({ playerKey: 20, playerName: 'B' }),
        player({ playerKey: 30, playerName: 'C' }),
      ];
      mapper.map(snapshot(all));

      const gap = mapper.map(snapshot([all[0]!, all[2]!]));

      expect(gap.players.map((p) => [p.name, p.slot])).toEqual([
        ['A', 1],
        ['C', 3],
      ]);
    });

    it('gives a returning player the slot they had', () => {
      const mapper = new PcobMapper();
      const a = player({ playerKey: 10, playerName: 'A' });
      const b = player({ playerKey: 20, playerName: 'B' });
      mapper.map(snapshot([a, b]));
      mapper.map(snapshot([a]));

      const back = mapper.map(snapshot([b, a]));

      expect(back.players.find((p) => p.name === 'B')?.slot).toBe(2);
      expect(back.players.find((p) => p.name === 'A')?.slot).toBe(1);
    });

    it('numbers slots per team, not globally', () => {
      const update = new PcobMapper().map(
        snapshot([
          player({ playerKey: 10, teamId: 1 }),
          player({ playerKey: 20, teamId: 2 }),
          player({ playerKey: 30, teamId: 2 }),
        ]),
      );

      expect(update.players.map((p) => [p.teamNo, p.slot])).toEqual([
        [1, 1],
        [2, 1],
        [2, 2],
      ]);
    });

    it('drops a fifth team member rather than inventing a slot the overlay cannot draw', () => {
      const warnings: string[] = [];
      const mapper = new PcobMapper({ log: (m) => warnings.push(m) });

      const update = mapper.map(
        snapshot(Array.from({ length: 5 }, (_u, i) => player({ playerKey: i + 1 }))),
      );

      expect(update.players).toHaveLength(4);
      expect(warnings.join(' ')).toContain('more than 4 players');
    });
  });

  describe('kills', () => {
    it('never decreases, whatever killNum does after death', () => {
      // killNum's post-death behaviour is undocumented. A team's ELIMS visibly counting down would
      // be blamed on us, so the mapper takes a high-water mark.
      const mapper = new PcobMapper();
      mapper.map(snapshot([player({ killNum: 4 })]));

      const afterDeath = mapper.map(snapshot([player({ killNum: 0, liveState: 5 })]));

      expect(afterDeath.players[0]?.kills).toBe(4);
    });

    it('uses killNumBeforeDie when it is the larger figure', () => {
      const update = new PcobMapper().map(
        snapshot([player({ killNum: 0, killNumBeforeDie: 3, liveState: 5 })]),
      );

      expect(update.players[0]?.kills).toBe(3);
    });

    it('still works when killNumBeforeDie is absent entirely', () => {
      // The 1.5.0 wire sample has no such field, and whether the current game sends it is unknown.
      const update = new PcobMapper().map(snapshot([player({ killNum: 2 })]));

      expect(update.players[0]?.kills).toBe(2);
    });
  });

  describe('rank', () => {
    it('passes the raw rank through unchanged', () => {
      // Confirmed reliable by a live capture — specs/PCOB-API.md §6. MatchStore is what decides
      // whether to trust it; the mapper's only job is to not lose it.
      const update = new PcobMapper().map(snapshot([player({ rank: 2 })]));

      expect(update.players[0]?.rank).toBe(2);
    });

    it('defaults to 0 — still playing — when absent', () => {
      const update = new PcobMapper().map(snapshot([player()]));

      expect(update.players[0]?.rank).toBe(0);
    });

    it('truncates a fractional value rather than passing it downstream', () => {
      // `Team.placement` is schema-typed as an integer. A fractional value here would fail that
      // schema on the way out over the WebSocket, and the client drops the whole message — freezing
      // the overlay silently for the rest of the match.
      const update = new PcobMapper().map(snapshot([player({ rank: 2.5 })]));

      expect(update.players[0]?.rank).toBe(2);
    });
  });

  describe('match boundaries', () => {
    it('drops slot and kill state when GameID changes', () => {
      const mapper = new PcobMapper();
      mapper.map(snapshot([player({ playerKey: 10, playerName: 'A', killNum: 7 })]));

      const next = mapper.map(
        snapshot(
          [
            player({ playerKey: 20, playerName: 'B' }),
            player({ playerKey: 10, playerName: 'A', killNum: 0 }),
          ],
          { GameID: 'room-2' },
        ),
      );

      expect(next.matchId).toBe('room-2');
      // A takes slot 2 now, and their kills start from zero: last match's figures must not leak.
      expect(next.players.find((p) => p.name === 'A')).toMatchObject({ slot: 2, kills: 0 });
    });

    it('reports a missing GameID as null rather than inventing one', () => {
      const update = new PcobMapper().map({
        allInfo: { TotalPlayerList: [player()] },
        isInGame: true,
      });

      expect(update.matchId).toBeNull();
    });
  });

  describe('phase', () => {
    it('is idle when nothing has been posted yet', () => {
      const update = new PcobMapper().map({ allInfo: {}, isInGame: false });

      expect(update).toMatchObject({ phase: 'idle', matchId: null, players: [] });
    });

    it('is live while isInGame is true', () => {
      expect(new PcobMapper().map(snapshot([player()])).phase).toBe('live');
    });

    it('is ended once FinishedStartTime is set, even while isInGame lingers', () => {
      const mapper = new PcobMapper();
      mapper.map(snapshot([player({ liveState: 1 })])); // Primes "started" — the plane has flown.

      const update = mapper.map(snapshot([player()], { FinishedStartTime: '1820' }, true));

      expect(update.phase).toBe('ended');
    });

    it('is ended, not idle, when the game drops out but players are still reported', () => {
      // Reporting idle here would make MatchStore reset and discard the final standings.
      const mapper = new PcobMapper();
      mapper.map(snapshot([player({ liveState: 1 })])); // Primes "started" — the plane has flown.

      const update = mapper.map(snapshot([player()], {}, false));

      expect(update.phase).toBe('ended');
    });
  });

  describe('tolerating what the vendor documents disagree about', () => {
    it('reads the 1.5.0 envelope and field spellings', () => {
      const update = new PcobMapper().map({
        allInfo: {
          playerInfoList: [
            { uID: 510002331, playerName: 'Legacy', teamId: 3, health: 55, healthMax: 100, liveState: 4 },
          ],
        },
        isInGame: true,
      });

      expect(update.players[0]).toMatchObject({
        id: '510002331',
        name: 'Legacy',
        teamNo: 3,
        liveState: 'knocked',
        health: 55,
      });
    });

    it('skips a player whose teamId is outside the configurable range', () => {
      const warnings: string[] = [];
      const mapper = new PcobMapper({ log: (m) => warnings.push(m) });

      const update = mapper.map(snapshot([player({ teamId: 99 }), player({ playerKey: 2 })]));

      expect(update.players).toHaveLength(1);
      expect(warnings.join(' ')).toContain('teamId 99');
    });

    it('falls back to a sane healthMax rather than dividing by zero downstream', () => {
      const update = new PcobMapper().map(snapshot([player({ healthMax: 0, health: 40 })]));

      expect(update.players[0]?.healthMax).toBe(100);
    });

    it('keeps a player who has a name but no id', () => {
      // Two players sharing a name is a cosmetic fault; dropping them from the table is not.
      const update = new PcobMapper().map(
        snapshot([{ playerName: 'Nameless', teamId: 1, health: 10, healthMax: 100, liveState: 0 }]),
      );

      expect(update.players[0]).toMatchObject({ id: 'Nameless', name: 'Nameless' });
    });
  });

  describe('warmup', () => {
    /**
     * The two real tournament-lobby captures this detection was built from, one taken during warmup
     * and one the moment the plane launched (`specs/PCOB-API.md` §8). Asserting against the actual
     * payloads rather than a hand-written imitation is the whole point: an imitation would only
     * prove the code agrees with my reading of the format.
     */
    function capture(name: 'warmup' | 'plane'): Record<string, unknown>[] {
      const file = new URL(`../../../../specs/${name}.txt`, import.meta.url);
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
        playerInfoList: Record<string, unknown>[];
      };
      return parsed.playerInfoList;
    }

    it('reads the real warmup capture as warmup', () => {
      const players = capture('warmup');
      expect(players.every((entry) => entry['liveState'] === 0)).toBe(true);

      const update = new PcobMapper().map(snapshot(players));

      expect(update.inWarmup).toBe(true);
    });

    it('reads the real plane capture as the round having started', () => {
      const players = capture('plane');
      expect(players.every((entry) => entry['liveState'] === 1)).toBe(true);

      const update = new PcobMapper().map(snapshot(players));

      expect(update.inWarmup).toBe(false);
    });

    it('never reports a warmup lobby as ended, whatever isInGame says', () => {
      // The dangerous path: with `isInGame` false and players present, the mapper used to call that
      // an ended match — which auto-closes a map, with final placements for a round nobody has
      // played, into the permanent series history. Whether `isInGame` is true during warmup is
      // still unconfirmed, so this must hold either way.
      const warmup = capture('warmup');

      expect(new PcobMapper().map(snapshot(warmup, {}, false)).phase).toBe('live');
      expect(new PcobMapper().map(snapshot(warmup, {}, true)).phase).toBe('live');
    });

    it('stays started once the lobby has dropped, as players land back to liveState 0', () => {
      // The in-flight signal is a starting gun, not a state to poll: everyone is back on the ground
      // within seconds, and falling back to "warmup" then would stop recording the whole round.
      const mapper = new PcobMapper();
      expect(mapper.map(snapshot(capture('plane'))).inWarmup).toBe(false);

      expect(mapper.map(snapshot(capture('warmup'))).inWarmup).toBe(false);
    });

    it('starts fresh for a new match, so the next warmup is caught too', () => {
      const mapper = new PcobMapper();
      mapper.map(snapshot(capture('plane')));

      const next = mapper.map({
        allInfo: { TotalPlayerList: capture('warmup'), GameID: 'room-2' },
        isInGame: true,
      });

      expect(next.inWarmup).toBe(true);
    });

    it('treats a decided placement as the round being under way, with no plane in sight', () => {
      // The fallback for connecting after everyone has landed. `rank` only: it is a team's
      // placement in the battle-royale round proper, a concept warmup has no equivalent of.
      const update = new PcobMapper().map(
        snapshot([player(), player({ playerKey: 2, playerName: 'Other', rank: 4 })]),
      );

      expect(update.inWarmup).toBe(false);
    });

    it.each([
      ['a scored elimination', { killNum: 3 }],
      ['a player already out', { liveState: 5 }],
      ['a player knocked', { liveState: 4 }],
    ])(
      'does NOT treat %s as the round starting — warmup-island PvP produces exactly this',
      (_label, overrides) => {
        // Regression: PUBG Mobile's warmup island is a real pre-drop practice area where players
        // can shoot, knock and kill each other. Using any of these as a "round started" signal
        // would let warmup PvP trigger it — found live, on the first real tournament match this
        // detection ran against: a warmup skirmish closed a phantom "map 1" with a full placement
        // table and real points, out of a round nobody had played.
        const update = new PcobMapper().map(
          snapshot([player(), player({ playerKey: 2, playerName: 'Other', ...overrides })]),
        );

        expect(update.inWarmup).toBe(true);
      },
    );

    it('nets out a warmup kill once the plane launches, even if the API keeps reporting it', () => {
      // The real failure mode this baseline exists for: a plain `maxKills.clear()` would do nothing
      // if PCOB's own `killNum` genuinely carries the warmup kill forward under the same `GameID`,
      // since `killsFor` takes the *maximum* of our cache and the API's own current reading.
      const mapper = new PcobMapper();
      const shooterId = 'shooter';
      const warmupWithAKill = [player({ playerKey: shooterId, killNum: 3, liveState: 0 })];
      const planeStillReportingIt = [player({ playerKey: shooterId, killNum: 3, liveState: 1 })];

      mapper.map(snapshot(warmupWithAKill, {}, false));
      const atLaunch = mapper.map(snapshot(planeStillReportingIt));

      expect(atLaunch.inWarmup).toBe(false);
      // Zeroed, not 3 — this is the tick after the boundary, once the baseline has taken effect.
      const nextTick = mapper.map(snapshot(planeStillReportingIt));
      expect(nextTick.players[0]?.kills).toBe(0);

      // Real kills scored afterwards still count, on top of the netted-out baseline.
      const twoRealKillsLater = mapper.map(
        snapshot([player({ playerKey: shooterId, killNum: 5, liveState: 1 })]),
      );
      expect(twoRealKillsLater.players[0]?.kills).toBe(2);
    });

    it('does not net out real kills recovered mid-round via the rank fallback', () => {
      // The recovery path (no flight signal seen, `rank` catches up instead) means the app is
      // joining an *already-live* round, not crossing the warmup boundary — so nothing here is
      // warmup contamination. Baselining it anyway would erase kills the team had genuinely earned
      // between the round's real start and however late this signal happened to catch up.
      const mapper = new PcobMapper();
      const alreadyMidRound = [
        player({ playerKey: 'a', killNum: 4, liveState: 0 }),
        player({ playerKey: 'b', killNum: 0, liveState: 0, rank: 3 }), // already eliminated, ranked.
      ];

      const update = mapper.map(snapshot(alreadyMidRound));

      expect(update.inWarmup).toBe(false);
      expect(update.players.find((p) => p.id === 'a')?.kills).toBe(4); // Not netted to 0.
    });

    it('starts a fresh baseline for a new match, unaffected by the previous one', () => {
      const mapper = new PcobMapper();
      const shooterId = 'shooter';
      mapper.map({
        allInfo: { TotalPlayerList: [player({ playerKey: shooterId, killNum: 7, liveState: 0 })], GameID: 'g1' },
        isInGame: false,
      });
      mapper.map({
        allInfo: { TotalPlayerList: [player({ playerKey: shooterId, killNum: 7, liveState: 1 })], GameID: 'g1' },
        isInGame: true,
      }); // baseline for g1 = 7.

      const freshMatch = mapper.map({
        allInfo: { TotalPlayerList: [player({ playerKey: shooterId, killNum: 0, liveState: 0 })], GameID: 'g2' },
        isInGame: false,
      });

      expect(freshMatch.players[0]?.kills).toBe(0); // Not negative, not stale from g1.
    });

    it('is not warmup when there are no players at all', () => {
      const update = new PcobMapper().map(snapshot([]));

      expect(update.inWarmup).toBe(false);
      expect(update.phase).toBe('live');
    });

    it('unlatches on an empty lobby, so the next warmup is caught without a new match id', () => {
      // `GameID` comes from `getallinfo` and its absence is a documented possibility (§8). With no
      // id ever changing, the latch would otherwise survive from the first round of the day to the
      // last and let every later warmup through.
      const mapper = new PcobMapper();
      const noGameId = (players: Record<string, unknown>[]): PcobSnapshot => ({
        allInfo: { TotalPlayerList: players },
        isInGame: true,
      });

      expect(mapper.map(noGameId(capture('plane'))).inWarmup).toBe(false);
      mapper.map(noGameId([])); // The lobby empties between rounds.

      expect(mapper.map(noGameId(capture('warmup'))).inWarmup).toBe(true);
    });
  });
});
