# PCOB API — wire reference

What the PCOB local HTTP API actually returns, and what we have to do about it.

Sources. **Where two of them conflict, the newer wins** — the operator's rule, applied throughout and
worked through in [§2](#2-the-two-shape-problem-read-this-before-writing-a-parser):

| #   | Source                                                                               | What it is                                                                                                          |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| A   | `specs/new/[updated] PC OB API List.pdf` — _Interface Guideline_ section (pp. 11–19) | Concrete JSON samples of real responses. **The only evidence of actual wire format we have.** Content is 1.5.0-era. |
| B   | `specs/new/[updated] PC OB API List.pdf` — header section (pp. 1–5)                  | A data dictionary for version 3.0.0. Field _meanings_ and the newer additions. Not a wire sample.                   |
| C   | `specs/new/PCOB API updated rules  2023.2.6.pdf`                                     | How and when each group of fields updates. No field format.                                                         |
| D   | `specs/_PCOB Guideline (Last updated 6th Jan 2026).pdf`                              | Operator guideline. Distilled in [`PCOB-FINDINGS.md`](PCOB-FINDINGS.md).                                            |

Each field below carries an evidence marker:

- **wire** — appears in a concrete JSON sample. The only proof a field exists at all — but the sample
  is 1.5.0, so its **spelling is the legacy one** where 3.0.0 renamed it.
- **doc** — listed in the 3.0.0 dictionary only. Newer, therefore the expected spelling, but never
  seen on the wire, so its existence is unproven.
- **conflict** — the two disagree. Read the note.

Neither marker alone is sufficient, which is the whole problem: the document that proves a field
exists is not the one that gives its current name.

> **Status: good enough to write the adapter against, not good enough to trust blind.** One captured
> response from a live match closes every remaining question in [§8](#8-what-is-still-missing). Until
> then the adapter must parse tolerantly — see [§7](#7-what-this-changes-in-our-code).

---

## 1. Transport

```
GET http://<hostip>:10086/<geturl>
```

`hostip` is **the OB client PC's address** — the guideline says so explicitly, not "localhost". So the
API is reachable across the venue LAN, not only over loopback. [ADR-0010](../docs/adr/0010-poll-the-pcob-http-api.md)
already specifies a configurable base URL defaulting to `http://127.0.0.1:10086`; that default is
right, and the configurability is now confirmed as necessary rather than speculative.

No authentication. JSON responses. All routes are `GET`, including the one named `setcircleinfo`
(which reads circle state despite the verb — see [§5](#5-the-remaining-live-endpoints)).

### Endpoints

The guideline's own sentence — _"for now we have below data set you can access"_ — lists six. That
sentence is 1.5.0-era; the same PDF documents seven more added in 2.5.0–3.0.0 that are presumably
also reachable but are **not** in that list.

| Route                                                                                      | Purpose                                              | We need it                           |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------ |
| `gettotalplayerlist`                                                                       | Every player's live state                            | **Yes — the primary feed**           |
| `getteaminfolist`                                                                          | Per-team totals, and (3.0.0) match timing + `GameID` | **Yes**                              |
| `isingame`                                                                                 | `{"isInGame": true}`                                 | **Yes — match phase**                |
| `getkillinfo`                                                                              | Kill / knock-down feed                               | Later (kill feed, live knock counts) |
| `getgameglobalinfo`                                                                        | Circle and flight path                               | Later (minimap)                      |
| `setcircleinfo`                                                                            | Current circle timer state                           | Later                                |
| `getobservingplayer`                                                                       | Which player each OB client is watching              | Later (highlight the observed team)  |
| `getplayerweapondetailinfo`                                                                | Per-weapon accuracy breakdown                        | Post-match export                    |
| `gettdmresultinfo`                                                                         | Team-deathmatch results                              | Not our format                       |
| `getairdropboxinfo`, `getteambackpackinfo`, `getplayersaminfo`, `getplayerssightusageinfo` | Loadout / item detail                                | No                                   |

---

## 2. The two-shape problem — read this before writing a parser

The same PDF describes `gettotalplayerlist` **twice, differently**. This is the single largest risk
in the whole integration, so it gets its own section.

|                                            | Source B (3.0.0 dictionary) | Source A (wire sample)                       |
| ------------------------------------------ | --------------------------- | -------------------------------------------- |
| Envelope key                               | `TotalPlayerList`           | `playerInfoList`                             |
| Player id                                  | `uId`                       | `uID`                                        |
| Position                                   | `location` (one field)      | `posX`, `posY`, `posZ`                       |
| Survival time                              | `survivalTime`              | `surviceTime` _(sic — a typo in the source)_ |
| Blue circle flag                           | `isOutsideBlueCircle`       | `isOutSideBlueCircle`                        |
| `teamName`, `bHasDied`, `killNumBeforeDie` | present                     | **absent**                                   |

### Resolution: the newer section wins

**Operator decision, 2026-08-17: where two documents conflict, the newer one is taken as correct.**
Applied here — and note that the conflict is _inside one PDF_, between its 3.0.0 header section and
its 1.5.0-era Interface Guideline, so the rule is applied between sections by the same logic.

**Source B (3.0.0) is therefore primary. Source A's names become legacy aliases.**

| Field            | Expected (3.0.0)      | Accepted as legacy       |
| ---------------- | --------------------- | ------------------------ |
| Envelope         | `TotalPlayerList`     | `playerInfoList`         |
| Player id        | `uId`                 | `uID`                    |
| Survival time    | `survivalTime`        | `surviceTime`            |
| Blue circle flag | `isOutsideBlueCircle` | `isOutSideBlueCircle`    |
| Position         | `location`            | `posX` / `posY` / `posZ` |

Because [§7.1](#71-parse-tolerantly-at-the-boundary-validate-strictly-after-mapping) looks fields up
through an alias list, this ordering costs nothing if it turns out to be backwards — both spellings
are read either way. What it decides is which name we treat as expected and which we log as a legacy
fallback, so a capture that disagrees shows up as a warning naming the field rather than as silence.

**One place where the rule gives the weaker answer, stated honestly:** for position, source A is
strictly more useful. It gives three concrete scalars in cm; source B gives the name `location` and
never says what shape it has — object, array, or string. So for position we read `location` first and
fall back to `posX/posY/posZ`, and if `location` ever turns up we will have to discover its shape at
runtime. This costs nothing today: the leaderboard does not use position at all. It would matter for
a minimap.

**What no rule can settle:** whether `teamName`, `bHasDied` and `killNumBeforeDie` are on the wire at
all. Source A predates them, so its silence is not evidence of absence, and source B is not a wire
sample. `killNumBeforeDie` is the one that matters — it keeps a dead player's elimination count from
resetting — so the adapter must treat it as optional and fall back to the last `killNum` seen while
the player was alive.

**Consequence for the adapter:** field lookup must be tolerant — case-insensitive, alias-aware,
indifferent to extra keys, and tolerant of absent ones. See [§7](#7-what-this-changes-in-our-code).

---

## 3. `gettotalplayerlist`

Wire sample (source A, abridged, exactly as printed). Per
[§2](#2-the-two-shape-problem-read-this-before-writing-a-parser) the names below are now the
**legacy** spellings — they are shown because they are the only concrete sample that exists, not
because they are the ones to expect first:

```jsonc
{
  "playerInfoList": [
    {
      "uID": 510002331,
      "playerOpenId": "100086",
      "playerName": "PlayerNo101",
      "picUrl": "http://down.qq.com/jdqssy/Share_Icon.png",
      "showPicUrl": false,
      "teamId": 1,
      "character": "None",
      "isFiring": false,
      "posX": -1648,
      "posY": 1054,
      "posZ": 110,
      "health": 100,
      "healthMax": 100,
      "liveState": 0,
      "killNum": 0,
      "playerKey": 1253582361,
      "rank": 0,
      // …counters, all 0 in this sample…
      "curWeaponID": 0,
    },
  ],
}
```

### Fields we actually use

| Field                  | Evidence | Meaning                                                                 | Note                                                                                                                                                                   |
| ---------------------- | -------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `teamId`               | wire     | Team ID                                                                 | Our join key to the roster. Sample shows `1`; the ini supports 1–25.                                                                                                   |
| `playerKey`            | wire     | Player's ID                                                             | **Use this as the player key.** The 2.5.0+ endpoints (`getteambackpackinfo`, `getplayerweapondetailinfo`) key on `PlayerKey`, which makes it the canonical identifier. |
| `uID`                  | wire     | Player's ID                                                             | A second identifier. Purpose vs `playerKey` undocumented.                                                                                                              |
| `playerOpenId`         | wire     | Player ID                                                               | The account-level OPENID — the same number used for whitelisting. Stable across matches; the other two may not be.                                                     |
| `playerName`           | wire     | Display name                                                            |                                                                                                                                                                        |
| `health` / `healthMax` | wire     | Current / max HP                                                        | Never hardcode 100.                                                                                                                                                    |
| `liveState`            | wire     | See the table below                                                     |                                                                                                                                                                        |
| `killNum`              | wire     | Kills                                                                   |                                                                                                                                                                        |
| `killNumBeforeDie`     | doc      | Kills held at death                                                     | Needed so a dead player's elims do not reset. **Not in the wire sample** — verify.                                                                                     |
| `rank`                 | wire     | _"Team rank. `0` means still playing. >1 is the ranking of that game."_ | See [§6](#rank-changes-what-we-thought).                                                                                                                               |

### `liveState` — the enum, finally

Identical in sources A and B, so this is settled.

| Value | Status                  | Maps to our `PlayerLiveState`                              |
| ----- | ----------------------- | ---------------------------------------------------------- |
| 0     | Normal                  | `alive`                                                    |
| 1     | On Plane                | `alive`                                                    |
| 2     | On Parachute            | `alive`                                                    |
| 3     | On Vehicle              | `alive`                                                    |
| 4     | DBNO (down but not out) | `knocked`                                                  |
| 5     | Dead                    | `dead`                                                     |
| 6     | Disconnected            | **undecided — see [§7](#7-what-this-changes-in-our-code)** |

### Fields we do not use yet

`picUrl` (documented _not stable_), `showPicUrl`, `character`, `isFiring`, `posX/Y/Z`, `curWeaponID`,
`gotAirDropNum`, `maxKillDistance`, `damage`, `killNumInVehicle`, `killNumByGrenade`,
`isOutSideBlueCircle`, and the whole after-match block.

### Units

`posX/Y/Z` cm · `maxKillDistance` cm · `driveDistance` m · `marchDistance` m · `survivalTime` s.

### The after-match trap, confirmed

Source C is explicit: `inDamage`, `heal`, `headShotNum`, `survivalTime`, `driveDistance`,
`marchDistance`, `assists`, `outsideBlueCircleTime`, `knockouts`, `rescueTimes`, `useSmokeGrenadeNum`,
`useFragGrenadeNum`, `useBurnGrenadeNum`, `useFlashGrenadeNum` are **present and hold `0` for the
entire match**, and are only populated once the game ends.

Any overlay binding to them mid-match displays a confident zero. They must be modelled as _not yet
available_, not as the number `0`.

---

## 4. `getteaminfolist`

Two shapes again, and here the difference is not cosmetic.

**Source A (wire, 1.5.0):**

```jsonc
{
  "teamInfoList": [
    {
      "teamId": 1,
      "isShowLogo": false,
      "logoPicUrl": "http://xxx/xxx.png",
      "killNum": 0,
      "liveMemberNum": 1,
    },
  ],
}
```

**Source B (3.0.0)** adds `teamName` per entry, and — importantly — **five top-level fields
alongside the array**:

| Field               | Documented meaning                   | Comment                                                         |
| ------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `GameID`            | Game ID                              | **The match identifier we have been missing.**                  |
| `GameStartTime`     | _"Game time ( 0 ~ xxx seconds )"_    | The name lies: this is **elapsed** time, not a start timestamp. |
| `FightingStartTime` | Timing of game start (flight starts) |                                                                 |
| `FinishedStartTime` | Timing of WWCD appears               | Match-end signal.                                               |
| `CurrentTime`       | Current time                         |                                                                 |

Per-team, `killNum` (team total kills) and `liveMemberNum` (0–4) are both given directly. We compute
both ourselves from the player list — keep doing so, and use these as a **cross-check**, since they
come from a different code path upstream and can disagree during the skew window ([§6](#rank-changes-what-we-thought)).

---

## 5. The remaining live endpoints

**`isingame`** → `{"isInGame": true}`. The cheapest match-phase signal there is.

**`getkillinfo`** → a kill/knock feed:

```jsonc
{
  "killInfo": [
    {
      "CauserName": "PlayerNo101",
      "VictimName": "PlayerNo102",
      "ResultHealthStatus": "1",
      "CurGameTime": "236",
      "Distance": 18,
    },
  ],
}
```

`ResultHealthStatus`: `1` = knocked down, `2` = killed. **This matters more than it looks.**
`PCOB-FINDINGS.md` §2.3 recorded that a live knock count was not available because `knockouts` is
after-match only. It is available — from this feed. Two catches before anyone relies on it: names are
used as identifiers here rather than `playerKey`, so correlating back to a player means matching on
`playerName`; and nothing says whether the array is cumulative for the match or only recent events —
if it is the latter, polling can miss events between requests.

**`getgameglobalinfo`** → `CircleArray` (X, Y, Size — first entry is the current circle) plus
`PlaneStartLocX/Y` and `PlaneStopLocX/Y`. Carries a red warning in the source: _godview can stop this
endpoint updating properly; a dedicated PC watching a player's POV is required for correct data._
An operational constraint to remember before promising a minimap.

**`setcircleinfo`** → despite the verb, a read: `GameTime`, `CircleStatus` (0 wait / 1 delay / 2 move),
`CircleIndex`, `Counter`, `MaxTime`.

**`getobservingplayer`** → maps each OB client ID to the character ID it is watching. Would let the
overlay highlight the team currently on camera.

**Post-match detail** — `getplayerweapondetailinfo` (per-weapon fire/hit/headshot/damage, keyed on
`PlayerID` = PlayerKey and `RoomID` = GameID), `getairdropboxinfo`, `getteambackpackinfo`,
`getplayersaminfo`, `getplayerssightusageinfo`, `gettdmresultinfo`. Relevant to the post-match export
backlog item, not to the leaderboard.

Weapon IDs referenced by `curWeaponID` and `WeaponID` are listed in
[`pcob-weapon-ids.md`](pcob-weapon-ids.md) — retrieved from the link in the API PDF.

---

## 6. Update semantics — and the skew that follows

From source C, and this is the part that is easy to miss:

The game server collects **three groups** every 2 seconds and sends them to the PCOB client over
**two independent channels**:

| Group                                                                                                                       | Channel | Cadence                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------- |
| `PlayerBaseInfo` — location, health, healthMax, liveState, killNum, killNumBeforeDie                                        | A       | Almost every tick (location churns constantly) |
| `PlayerRealTimeAPI` — gotAirDropNum, maxKillDistance, damage, killNumInVehicle, killNumByGrenade, rank, isOutsideBlueCircle | B       | Only on change                                 |
| `PlayerAfterMatchAPI` — the whole after-match block                                                                         | B       | Zero until the match ends                      |

On receiving **any** group, the PCOB client updates its `gettotalplayerlist` document and POSTs it to
its own local HTTP server — the one we then GET from on port 10086. Multiple groups arriving in one
frame produce multiple POSTs.

Two consequences:

1. **A single response can mix generations.** `health` may be from one tick and `damage` from the
   previous one. Harmless for a leaderboard; fatal for anything that assumes internal consistency
   across groups — including inferring "the match ended" from one group alone.
2. **Our effective input is ~0.5 Hz and event-driven**, not a smooth stream. The overlay must
   interpolate or accept 2-second steps; diffing must happen on our side, or `location` churn alone
   will re-render the leaderboard twice a second for nothing.

### `rank` changes what we thought

`PCOB-FINDINGS.md` §2.4 recorded that placement is _"our logic, not from API"_. That is now wrong:
`rank` is documented as **the team's placement, `0` while still playing**.

This does not mean we delete our elimination-order tracking. It means:

- Treat `rank` as the **primary** source of placement once a capture confirms it behaves as
  documented live (rather than, say, only populating after the match like the after-match block does).
- Keep the elimination-order derivation as the **fallback**, since it is the only thing that works if
  `rank` turns out to be post-match-only.
- Note the source says _">1 is the ranking"_. Almost certainly `>=1` — a first place has to be
  expressible. Do not encode `>1` literally.

**Evidence that it does populate live:** source C files `Rank` under **`PlayerRealTimeAPI`**, not
under `PlayerAfterMatchAPI`. The after-match group is the one documented to hold `0` until the game
ends; `rank` is explicitly not in it. That is not the same as a capture, but it is a second document
agreeing, and it makes "primary source, with the elimination-order fallback" the right way round.

### The same grouping settles two more things

- **`killNumBeforeDie` is live** — source C files it under `PlayerBaseInfo`. So a dead player's
  elimination count is available during the match, which is what the ELIMS column needs.
- **Damage dealt is live; damage taken is not.** `Damage` sits in `PlayerRealTimeAPI`, `InDamage` in
  `PlayerAfterMatchAPI`. A live damage-leaderboard overlay is therefore possible; a live
  damage-taken column is not.

---

## 7. What this changes in our code

Nothing here is implemented yet; this is the work list the report produces.

### 7.1 Parse tolerantly at the boundary, validate strictly after mapping

Our house style is Zod everywhere ([ADR-0005](../docs/adr/0005-monorepo-with-shared-contracts.md)). At
_this_ boundary a strict schema over the raw payload is the wrong instrument: the source documents
cannot agree on `isOutSideBlueCircle` vs `isOutsideBlueCircle` or `survivalTime` vs `surviceTime`, and
the PCOB client version moves independently of us
([`PCOB-FINDINGS.md`](PCOB-FINDINGS.md) §5).

So: look fields up case-insensitively through an alias list, ignore unknown keys entirely, then
validate the object **we** built with Zod. A new upstream field must never blank an overlay.

Concretely, one lookup helper per field with an ordered alias list — 3.0.0 name first, legacy second
per [§2](#2-the-two-shape-problem-read-this-before-writing-a-parser) — that logs **once per field per
session** when it falls through to a legacy name or finds nothing. Logging once matters: at one poll
per second, a warning per miss would produce 3,600 identical lines an hour and bury the real one.

That log line is what turns the first real capture into an answer instead of an investigation.

### 7.2 Player slot has to be derived — the API does not have one

Our `Player.slot: 1..4` fixes each player to one bar in the ALIVE column. **No field in any of these
documents supplies it.**

It must be assigned by us and then frozen for the match — for example, ascending `playerKey` within a
`teamId`, decided on first sight. If it is recomputed per poll, a player leaving the list for one tick
reshuffles their teammates' bars on air.

Array order is the tempting alternative — the players probably arrive in a sensible order — but
nothing in any of these documents says the order is stable, and betting the overlay's visual
stability on an undocumented property is exactly the kind of thing that holds until it does not. Use
it, if at all, only as the tie-break that decides the initial assignment.

This whole scheme rests on `playerKey` being stable for the duration of a match, which is likewise
undocumented — see gap 5 in [§8](#8-what-is-still-missing).

### 7.3 `liveState: 6` (Disconnected) needs a product decision

Our `PlayerLiveState` is `alive | knocked | dead | unknown`. A disconnected player is none of those:
they are not dead, they can come back, but they are not standing either. Three options, and this is
the operator's call, not mine:

1. Map to `unknown` — no protocol change, but `unknown` currently means _"we have not heard about
   them"_, which is a different thing.
2. Map to `dead` — simple, and wrong the moment someone reconnects.
3. Add `disconnected` as a fifth value — the honest model. Costs a `PROTOCOL_VERSION` bump and a
   colour decision in the overlay.

### 7.4 Configuration the adapter needs

`PCOB_BASE_URL` (default `http://127.0.0.1:10086`) and `PCOB_POLL_MS` (default 1000). The base URL
must be a full host, not just a port — the API is documented as LAN-reachable ([§1](#1-transport)).

### 7.5 Things we can now cross-check rather than trust

`liveMemberNum` and team `killNum` from `getteaminfolist` against our own sums from the player list.
Disagreement is expected inside the skew window and is not an error — but a persistent disagreement
is a real signal worth logging.

---

## 8. What is still missing

| #   | Gap                                                                                                                                                                                                                                  | Severity | How it gets closed                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------ |
| 1   | **One captured response from a live match.** Settles the envelope key (`playerInfoList` vs `TotalPlayerList`), exact casing, and whether `killNumBeforeDie` / `teamName` / `bHasDied` are actually on the wire.                      | 🟠       | A rehearsal room is enough. Does not need a tournament.      |
| 2   | **Does `getteaminfolist` carry the `GameID` / timing block?** Only source B claims it. If it does not, our match identifier and end-of-match signal both disappear.                                                                  | 🟠       | Same capture.                                                |
| 3   | **Does `rank` populate live, or only after the match?** Decides whether it is our placement source or a cross-check.                                                                                                                 | 🟠       | Same capture — one player eliminated mid-match answers it.   |
| 4   | **Behaviour between matches.** Does `gettotalplayerlist` hold the previous match's data, empty out, or fail? Decides how we detect a new match rather than showing stale standings.                                                  | 🟡       | Same capture, observed across a match boundary.              |
| 5   | **Is `playerKey` stable for a whole match?** Undocumented. [§7.2](#72-player-slot-has-to-be-derived-the-api-does-not-have-one) rests on it: if it changes between polls, slot assignments break and the ALIVE bars reshuffle on air. | 🟠       | Same capture — compare two responses a few seconds apart.    |
| 6   | **`liveState: 6` handling** — [§7.3](#73-livestate-6-disconnected-needs-a-product-decision).                                                                                                                                         | 🟡       | A decision, not a capture.                                   |
| 7   | **The restricted schema spreadsheet** still returns **HTTP 401** (re-checked 2026-08-17, CSV export and gviz).                                                                                                                       | 🟢       | Now largely redundant — these two PDFs cover what we needed. |
| 8   | **`[20230322] PCOB Weapon / others item ID.xlsx`** is an _embedded attachment_ in the API PDF, not a link, so it is unreachable. The gun-ID list it partly duplicates was retrieved ([`pcob-weapon-ids.md`](pcob-weapon-ids.md)).    | 🟢       | Not needed for the leaderboard.                              |

**None of these blocks starting the adapter**, and 1–5 are all answered by the same single capture —
one PCOB client, one rehearsal room, two responses a few seconds apart, saved to disk. The
tolerant-parsing design in
[§7.1](#71-parse-tolerantly-at-the-boundary-validate-strictly-after-mapping) exists precisely so that
being wrong about a field name is a logged warning rather than a dead overlay.

Worth stating plainly: the adapter can be **written and unit-tested now** against fixtures built from
[§3](#3-gettotalplayerlist), because [ADR-0006](../docs/adr/0006-pcob-ingestion-adapter-boundary.md)
confines every one of these unknowns to one file. What cannot be done without the capture is
_trusting_ it in a broadcast.
