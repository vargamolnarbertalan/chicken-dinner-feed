# PCOB API — wire reference

What the PCOB local HTTP API actually returns, and what we have to do about it.

Sources. **Where two of them conflict, the newer wins** — the operator's rule, applied throughout and
worked through in [§2](#2-the-two-shape-problem-solved-by-reading-the-server):

| #     | Source                                                                               | What it is                                                                                                          |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| A     | `specs/new/[updated] PC OB API List.pdf` — _Interface Guideline_ section (pp. 11–19) | Concrete JSON samples of real responses. **The only evidence of actual wire format we have.** Content is 1.5.0-era. |
| B     | `specs/new/[updated] PC OB API List.pdf` — header section (pp. 1–5)                  | A data dictionary for version 3.0.0. Field _meanings_ and the newer additions. Not a wire sample.                   |
| C     | `specs/new/PCOB API updated rules  2023.2.6.pdf`                                     | How and when each group of fields updates. No field format.                                                         |
| D     | `specs/_PCOB Guideline (Last updated 6th Jan 2026).pdf`                              | Operator guideline. Distilled in [`PCOB-FINDINGS.md`](PCOB-FINDINGS.md).                                            |
| **E** | **`ObToolsNew/ob.js` in the v4.3.0 client package**                                  | **The API server's own source. 1093 lines of plain Node. Outranks every document above.**                           |

> **Source E changes the status of this file.** From 2026-08-17 the answers below are read out of
> the running implementation, not inferred from vendor prose. Where a PDF and the source disagree,
> **the source wins** — it is what actually answers the requests.
>
> The package is ~47 GB, so it is gitignored rather than vendored; every claim drawn from it is
> quoted inline with a line number, so the reasoning survives without the payload.

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

**Confirmed in source.** `ob.js` ends with:

```js
httpserver.listen(10086); // no host argument
```

Node binds to **all interfaces** when no host is given, so the API is genuinely LAN-reachable, not
loopback-only. [ADR-0010](../docs/adr/0010-poll-the-pcob-http-api.md)'s configurable base URL
defaulting to `http://127.0.0.1:10086` is exactly right.

No authentication of any kind — there is no auth code in the file.

### How routing works, and why it matters

```js
// ob.js line 1080
let clientRequestPath = url.parse(request.url).pathname;
let handle = app[clientRequestPath.substring(1, clientRequestPath.length)];
if (handle) {
  handle(request, response);
} else {
  console.log('[Error]: handle not found');
}
```

Two consequences the PDFs never mention:

1. **The route table is just the `app` object.** Every `app.<name> = function` is a reachable route.
   There are **62**, not the thirteen the guideline lists.
2. **An unknown route never responds.** It logs and falls off the end — no 404, no body, the socket
   is simply left open until the client gives up. **Any request we make must carry a timeout**, or a
   typo in a route name hangs the adapter instead of erroring.

Routes come in `set*` / `get*` pairs: the game client POSTs to the `set*` half, we GET from the
`get*` half. `setcircleinfo` reads despite its name because it is the `get` side of a pair whose
naming was never tidied.

### Endpoints

Of the 62, these are the ones that matter to us. The guideline's list of six was 1.5.0-era.

| Route                                                                                      | Purpose                                      | We need it                           |
| ------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------ |
| **`getallinfo`**                                                                           | **Everything at once, including `GameID`**   | **Yes — make this the primary feed** |
| `gettotalplayerlist`                                                                       | Every player's live state                    | Yes — the documented subset          |
| `getteaminfolist`                                                                          | Per-team totals. **Does not carry `GameID`** | Yes                                  |
| `isingame`                                                                                 | `{"isInGame": true}`                         | **Yes — match phase**                |
| `getkillinfo`                                                                              | Kill / knock-down feed                       | Later (kill feed, live knock counts) |
| `getgameglobalinfo`                                                                        | Circle and flight path                       | Later (minimap)                      |
| `setcircleinfo`                                                                            | Current circle timer state                   | Later                                |
| `getobservingplayer`                                                                       | Which player each OB client is watching      | Later (highlight the observed team)  |
| `getplayerweapondetailinfo`                                                                | Per-weapon accuracy breakdown                | Post-match export                    |
| `gettdmresultinfo`                                                                         | Team-deathmatch results                      | Not our format                       |
| `getairdropboxinfo`, `getteambackpackinfo`, `getplayersaminfo`, `getplayerssightusageinfo` | Loadout / item detail                        | No                                   |

---

## 2. The two-shape problem — solved by reading the server

> **Resolved 2026-08-17 by reading the source.** The v4.3.0 client package contains
> `ObToolsNew/ob.js` — 1093 lines of plain, unobfuscated Node. **It _is_ the API server.**
> `launch.bat` contains exactly one line: `node.exe ob.js`.
>
> Source E outranks every PDF here. What follows is no longer inference.

The same PDF describes `gettotalplayerlist` **twice, differently** — and it turns out both
descriptions were accurate, because they document **two different hops**.

|                                            | Source B (3.0.0 dictionary) | Source A (wire sample)                       |
| ------------------------------------------ | --------------------------- | -------------------------------------------- |
| Envelope key                               | `TotalPlayerList`           | `playerInfoList`                             |
| Player id                                  | `uId`                       | `uID`                                        |
| Position                                   | `location` (one field)      | `posX`, `posY`, `posZ`                       |
| Survival time                              | `survivalTime`              | `surviceTime` _(sic — a typo in the source)_ |
| Blue circle flag                           | `isOutsideBlueCircle`       | `isOutSideBlueCircle`                        |
| `teamName`, `bHasDied`, `killNumBeforeDie` | present                     | **absent**                                   |

### The resolution, in six lines of source

```js
// ObToolsNew/ob.js, line 366
app.gettotalplayerlist = function (request, response) {
  let ret = {};
  ret.playerInfoList = []; //          <- the key WE receive
  if (app.allInfo) {
    if (app.allInfo['TotalPlayerList']) {
      //  <- the key the GAME sent in
      ret.playerInfoList = app.allInfo['TotalPlayerList']; // contents passed through untouched
    }
  }
  // ...
};
```

There are two hops, and each document describes one of them:

```
   PUBG Mobile game client                ob.js                        us
   ───────────────────────  POST  ───────────────────  GET  ───────────────
        TotalPlayerList      ──▶     app.allInfo        ──▶   playerInfoList
        (source B, 3.0.0)                                     (source A, guideline)
```

So the answer is a **hybrid neither PDF states**, and both were right about their own half:

|                          | Comes from               | Verdict                                                          |
| ------------------------ | ------------------------ | ---------------------------------------------------------------- |
| **Envelope key**         | ob.js renames it         | **`playerInfoList`. Always. Source A was correct.**              |
| **Player object fields** | passed through untouched | whatever the **game client** posts — i.e. source B's 3.0.0 names |

`ob.js` never looks inside the array. It swaps one key and re-serialises. Every field name, every
capitalisation, every `surviceTime`-style typo inside a player object is decided by the game client
version, not by anything we can read here.

### This retracts the previous resolution

The earlier revision applied the operator's _"newer document wins"_ rule and made `TotalPlayerList`
the expected envelope. **That was wrong** — not because the rule is wrong, but because it was applied
to a conflict that does not exist. The two documents never disagreed; they described different hops.

No harm done: the alias lookup in
[§7.1](#71-parse-tolerantly-at-the-boundary-validate-strictly-after-mapping) reads both spellings
either way. But the ordering is now settled by evidence rather than by a tie-break:

| Field            | Expected              | Note                                                |
| ---------------- | --------------------- | --------------------------------------------------- |
| Envelope         | `playerInfoList`      | Not an alias. The only key ob.js emits.             |
| Player id        | `uId`                 | 3.0.0 name; pass-through, so game-version dependent |
| Survival time    | `survivalTime`        | as above, `surviceTime` was the 1.5.0 spelling      |
| Blue circle flag | `isOutsideBlueCircle` | as above                                            |
| Position         | `location`            | as above, `posX/posY/posZ` was 1.5.0                |

**Confirmed 2026-08-28 by a live capture**, closing what used to be open here: `teamName`, `bHasDied`
and `killNumBeforeDie` all appear inside the player objects, on every poll — see
[§8](#closed-on-2026-08-28-by-a-live-1v1-match-capture). `killNumBeforeDie` is the one that matters —
it keeps a dead player's elimination count from resetting — so the adapter still treats it as
optional and falls back to the last `killNum` seen while the player was alive, since the field's
presence was never guaranteed by anything ob.js itself controls.

**Consequence for the adapter:** field lookup must still be tolerant — case-insensitive, alias-aware,
indifferent to extra keys, and tolerant of absent ones. The envelope is now certain; the contents are
not.

---

## 3. `gettotalplayerlist`

Wire sample (source A, abridged, exactly as printed). Per
[§2](#2-the-two-shape-problem-solved-by-reading-the-server) the names below are now the
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

## 3b. `getallinfo` — undocumented, and the one we should actually poll

Not in any PDF's endpoint list. Found by reading ob.js, where the route table is simply every
function on the `app` object (`app[pathname.substring(1)]`). There are **62 routes**, not thirteen.

```js
// ObToolsNew/ob.js, line 352
app.getallinfo = function (request, response) {
  let ret = {};
  if (app.allInfo) {
    ret.allinfo = app.allInfo; // the entire object the game posted, untouched
  }
  // ...
};
```

`app.allInfo` is whatever the game last POSTed to `/totalmessage`, stored verbatim. So `getallinfo`
returns **the complete 3.0.0 structure** — `TotalPlayerList`, `TeamInfoList`, and the top-level
`GameID`, `GameStartTime`, `FightingStartTime`, `FinishedStartTime`, `CurrentTime`.

Two reasons this should be the adapter's primary request:

1. **It is the only route that exposes `GameID`** — see [§4](#4-getteaminfolist) for why the
   documented route drops it. Our match-boundary decision
   ([§7.6](#76-match-boundaries)) depends on having it.
2. **One request instead of two**, and players and teams then come from the same snapshot rather
   than from two requests that could straddle an update.

Note the envelope is spelled `allinfo` — all lower case, unlike the `TotalPlayerList` inside it.

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

**Source B (3.0.0)** adds `teamName` per entry, and **five top-level fields alongside the array**:
`GameID`, `GameStartTime` (the name lies — it is _elapsed_ seconds, not a timestamp),
`FightingStartTime` (flight starts), `FinishedStartTime` (WWCD appears) and `CurrentTime`.

> ⚠️ **`getteaminfolist` does not serve any of those five.** From ob.js line 383:
>
> ```js
> ret.teamInfoList = app.allInfo['TeamInfoList']; // the array, and nothing else
> ```
>
> `GameID` and the timings are **siblings** of `TeamInfoList` inside `app.allInfo`, and this handler
> reaches past them. Source B was describing the object the game posts, not this response.
>
> **This closes gap 2, in the unhelpful direction — and then reopens it in a better one:** the match
> identifier is real and it is reachable, just not here. Use
> [`getallinfo`](#3b-getallinfo-undocumented-and-the-one-we-should-actually-poll).

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
after-match only. It is available — from this feed.

Source settles the semantics that the PDFs left open:

```js
app.killInfo.unshift(obj); // line 475 -- newest first, nothing ever removed
ret.killInfo = app.killInfo; // line 489 -- the entire accumulated array
```

So the feed is **cumulative, newest-first, unbounded, and never cleared between matches** — only an
`ob.js` restart empties it. A consumer therefore reads from the front and de-duplicates, and must
not assume the array belongs to the current match. Polling cannot miss an event, which was the risk
worth checking. Players are identified by **name** here, not `playerKey`, so correlating back to the
player list means matching on `playerName`.

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

On receiving **any** group, the PCOB client POSTs the whole object to its own local HTTP server — the
one we then GET from on port 10086. Multiple groups arriving in one frame produce multiple POSTs.

Source E shows exactly what that POST does:

```js
// ob.js line 330 -- POST /totalmessage
let obj = JSON.parse(body);
app.allInfo = obj; // wholesale replacement, no merge
```

**The replacement is total.** `app.allInfo` is not merged field by field — each POST swaps the entire
object. So if the game ever posts a partial object, everything absent from that POST vanishes from
the next response rather than retaining its previous value. Whether it ever does is unknown, but the
adapter should treat a field disappearing between polls as "unchanged", not as "reset to zero" —
which is the same defensive stance the after-match trap already requires.

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

**Decided 2026-08-17 — `rank` is primary, our elimination order is the automatic fallback.** We do
not delete the existing tracking; it becomes the safety net. Concretely:

- Take placement from `rank` whenever it is non-zero.
- **Fall back automatically**, per team, when a team we believe is eliminated still reports `rank: 0`
  after a grace period. That is the signature of `rank` turning out to be post-match-only, and it
  must not stop points being awarded mid-broadcast.
- Log the switch once. If it fires on every match, `rank` is post-match-only in practice and this
  section is wrong.
- Note the source says _">1 is the ranking"_. Almost certainly `>=1` — a first place has to be
  expressible. Do not encode `>1` literally.

**Evidence that it does populate live:** source C files `Rank` under **`PlayerRealTimeAPI`**, not
under `PlayerAfterMatchAPI`. The after-match group is the one documented to hold `0` until the game
ends; `rank` is explicitly not in it. That is not the same as a capture, but it is a second document
agreeing, and it makes "primary source, with the elimination-order fallback" the right way round.

**Confirmed by a real capture, 2026-08-28.** A 1v1 test match (`gettotalplayerlist`, polled at the
same moment `isingame` flipped to `false`): the winner carried `rank: 1`, `killNum: 1`, the loser
`rank: 2`. Both populated **immediately**, in the same poll as match end, no grace period needed. This
does not yet distinguish "populates the instant a team is eliminated, others still playing" from
"populates only once the whole match ends" — a 1v1 collapses those into the same event. That
narrower question needs a ≥3-team capture where one team is out early. What it does settle: `rank` is
reliably correct **by** the time `isingame` goes false, so the elimination-order fallback is not
required just to get final standings on screen.

One oddity from the same capture, noted but not acted on: the loser's `bHasDied` stayed `false` even
at `health: 0`, `liveState: 5`. Our code was already right not to key off `bHasDied` — `liveStateFor`
in `payload.ts` derives alive/dead from `liveState` alone — so this is a documentation note, not a
bug: do not add a `bHasDied` check later without re-reading this.

### The same grouping settles two more things

- **`killNumBeforeDie` is live** — source C files it under `PlayerBaseInfo`. So a dead player's
  elimination count is available during the match, which is what the ELIMS column needs.
- **Damage dealt is live; damage taken is not.** `Damage` sits in `PlayerRealTimeAPI`, `InDamage` in
  `PlayerAfterMatchAPI`. A live damage-leaderboard overlay is therefore possible; a live
  damage-taken column is not.

---

## 7. What this changes in our code

Nothing here is implemented yet; this is the work list the report produces.

### 7.0 Decisions taken — 2026-08-17

Four questions the documents raised but could not answer, settled by the operator so the adapter work
starts with none of them open.

| #   | Question                                   | Decision                                                                                                                   |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which document wins on conflict            | **The newer one** — [§2](#2-the-two-shape-problem-solved-by-reading-the-server)                                            |
| 2   | `liveState: 6` (Disconnected)              | **Add a fifth `disconnected` state** — [§7.3](#73-livestate-6-disconnected-is-a-state-of-its-own)                          |
| 3   | Player slot, which the API does not supply | **First-sight arrival order, frozen by `playerKey`** — [§7.2](#72-player-slot-has-to-be-derived-the-api-does-not-have-one) |
| 4   | Placement: `rank` or our elimination order | **`rank` primary, ours as automatic fallback** — [§6](#rank-changes-what-we-thought)                                       |
| 5   | New match (`GameID` change)                | **Reset internally, hold the previous table on screen until new data arrives** — [§7.6](#76-match-boundaries)              |
| 6   | Which route the adapter polls              | **`getallinfo`** — the only one carrying `GameID` — [§3b](#3b-getallinfo-undocumented-and-the-one-we-should-actually-poll) |
| 7   | Request timeout                            | **Mandatory.** An unknown route never responds at all — [§1](#how-routing-works-and-why-it-matters)                        |

### 7.1 Parse tolerantly at the boundary, validate strictly after mapping

Our house style is Zod everywhere ([ADR-0005](../docs/adr/0005-monorepo-with-shared-contracts.md)). At
_this_ boundary a strict schema over the raw payload is still the wrong instrument — but for a
sharper reason than before.

**Reading ob.js narrowed the uncertainty rather than removing it.** The envelope keys are now
certain: `ob.js` writes `playerInfoList`, `teamInfoList` and `allinfo` as string literals in its own
source. What is _not_ certain is anything **inside** those containers, because ob.js passes the
game's payload through without touching it
([§2](#2-the-two-shape-problem-solved-by-reading-the-server)). Those field names belong to the game
client — a component that updates on the publisher's schedule, independently of us
([`PCOB-FINDINGS.md`](PCOB-FINDINGS.md) §5) and independently even of `ob.js`.

So the rule splits:

| Layer                                                  | Treatment                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Envelope (`allinfo`, `playerInfoList`, `teamInfoList`) | **Assert it.** If it is missing, something is genuinely wrong.            |
| Player and team object fields                          | **Look up tolerantly** — case-insensitive, alias-aware, absence-tolerant. |

Concretely, one lookup helper per field with an ordered alias list — 3.0.0 name first, 1.5.0 second
per [§2](#the-resolution-in-six-lines-of-source) — that logs **once per field per session** when it
falls through to an older name or finds nothing. Logging once matters: at one poll per second, a
warning per miss would produce 3,600 identical lines an hour and bury the real one.

That log line is what turns the first real capture into an answer instead of an investigation.

### 7.2 Player slot has to be derived — the API does not have one

Our `Player.slot: 1..4` fixes each player to one bar in the ALIVE column. **No field in any of these
documents supplies it.**

**Decided 2026-08-17 — assign on first sight in arrival order, then freeze the mapping by
`playerKey`.**

The two halves do different jobs. _Arrival order_ decides the initial layout, on the reasoning that
the order the API happens to emit is most likely the in-game team order, so the bars match what the
caster sees on their own screen. _Freezing by `playerKey`_ is what makes it stable afterwards: once
a player owns slot 3, they own it for the match.

The consequence to get right is the empty slot. When a player is missing from one response, their
slot stays **empty** rather than collapsing — teammates must not slide up a row and then back down
two seconds later. That is the failure this decision exists to prevent, and it is invisible until it
happens on air.

Slot assignment is per match: it is recomputed from scratch when the match resets
([§7.6](#76-match-boundaries)).

This whole scheme rests on `playerKey` being stable for the duration of a match, which is
undocumented — see gap 5 in [§8](#8-what-is-still-missing). If a capture shows it is not, the
fallback is `uID`, and failing that `playerName` within a team.

### 7.3 `liveState: 6` (Disconnected) is a state of its own

**Decided 2026-08-17 — add `disconnected` as a fifth `PlayerLiveState`.**

Our enum was `alive | knocked | dead | unknown`. A disconnected player is none of those: not dead,
can return, but not standing either. Mapping them to `dead` would make the table resurrect someone on
reconnect, and could mis-award placement points; mapping them to `unknown` would conflate "gone" with
"never heard of".

Costs, both accepted:

- A **`PROTOCOL_VERSION` bump** — the value crosses the WebSocket to overlays.
- A **fourth appearance in the ALIVE column**. It has to read as distinct from dead at broadcast
  distance without adding a colour to a palette the operator already configures — an outline or
  dashed treatment on the existing dead colour rather than a new `--overlay-player-*` token.

Open sub-question for whoever builds it: does a disconnected player count toward
`standingPlayerCount`? They are not eliminated, so on the current definition — _"players not yet
eliminated"_ — yes. Keep that, and let the distinct bar carry the nuance.

### 7.4 Configuration the adapter needs

`PCOB_BASE_URL` (default `http://127.0.0.1:10086`) and `PCOB_POLL_MS` (default 1000). The base URL
must be a full host, not just a port — the API is documented as LAN-reachable ([§1](#1-transport)).

### 7.5 Things we can now cross-check rather than trust

`liveMemberNum` and team `killNum` from `getteaminfolist` against our own sums from the player list.
Disagreement is expected inside the skew window and is not an error — but a persistent disagreement
is a real signal worth logging.

### 7.6 Match boundaries

**Decided 2026-08-17 — on a new `GameID`, reset internally but keep the previous standings on screen
until the new match produces data.**

What resets: elimination order, slot assignments, kill baselines, the match id. What does _not_ reset
is what the overlay is currently rendering — the last good projection stays on air until the first
response for the new `GameID` arrives.

The reason is narrow and worth stating: between two matches of a tournament the director may well
still have the leaderboard keyed up while talent recaps the round just played. Blanking it the
instant the lobby rolls over would take the graphic out from under them, for the sake of a table
nobody is waiting for yet.

Two things this decision does not settle, both for whoever implements it:

- **What if `GameID` is absent?** It comes from `getteaminfolist` and only source B documents it
  (gap 2 in [§8](#8-what-is-still-missing)). Without it, the fallback signal is `isingame` going
  false and then true again.
- **A `GameID` that flaps** — from a reconnect rather than a real new match — must not reset
  anything. Require the new id to be stable across a couple of polls before acting on it.

---

## 8. What is still missing

| #   | Gap                                                                                                                                                                                                                                | Severity | How it gets closed                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------- |
| 5   | **The restricted schema spreadsheet** still returns **HTTP 401** (re-checked 2026-08-17).                                                                                                                                             | 🟢       | Redundant now. ob.js answered more than it would have.    |
| 6   | **`[20230322] PCOB Weapon / others item ID.xlsx`** is an _embedded attachment_ in the API PDF, not a link, so it is unreachable. The gun-ID list it partly duplicates was retrieved ([`pcob-weapon-ids.md`](pcob-weapon-ids.md)).       | 🟢       | Not needed for the leaderboard.                          |

Items 1–4 (`killNumBeforeDie`/`teamName`/`bHasDied` presence, `rank` timing, `playerKey` stability,
between-match behaviour) were closed 2026-08-28 by a live capture — see below.

### Closed on 2026-08-28 by a live 1v1 match capture

The first real match captured end-to-end (2 teams, 1 player each), from the plane through a death by
zone damage to a match restart. Concrete answers, not inference from source code:

| Was                                                                        | Answer                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do `killNumBeforeDie`, `teamName`, `bHasDied` appear in the player objects? | **Yes, all three, on every poll.** `teamName` was the client's auto-generated default (`"Team4"`, `"Team16"`) since no `TeamLogoAndColor.ini` was configured for this test — expect real values once one is imported.                                                    |
| Does `rank` populate live or only after the match?                        | **By match end, immediately** — winner `rank: 1`, loser `rank: 2`, in the same poll `isingame` flipped to `false`. See [§6](#rank-changes-what-we-thought). Still open: whether it populates for an _early-out_ team while others keep playing (needs a ≥3-team match). |
| Is `playerKey` stable for a whole match?                                  | **Yes within a match, no across matches.** Same two values held from the plane to the final poll of that match; the next match assigned each player a **different** `playerKey`. Confirms [§7.2](#72-player-slot-has-to-be-derived-the-api-does-not-have-one)'s "frozen by `playerKey`, reset on a new match" design was the right call.                                |
| Behaviour between matches                                                 | **The server kept answering with full final stats after `isingame` went `false`**, then a new match began (`isingame: true` again, positions reset to a plane drop, `rank` back to `0`, new `playerKey`s). `GameID` itself was not diffed across this specific boundary, so treat that one detail as still unconfirmed.                                                  |

Also newly seen, not previously documented anywhere: **`PoisonTotalDamage`, `UseSelfRescueTime`,
`UseEmergencyCallTime`** appear in the player object. Unmapped fields are ignored by design
([§7.1](#71-parse-tolerantly-at-the-boundary-validate-strictly-after-mapping)), so this needed no
code change — recorded here so nobody rediscovers them from scratch.

### Closed on 2026-08-17 by reading ob.js

| Was                                                         | Answer                                                                                                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which envelope key — `playerInfoList` or `TotalPlayerList`? | **`playerInfoList`.** Written as a string literal in ob.js. Both PDFs were right about different hops — [§2](#2-the-two-shape-problem-solved-by-reading-the-server). |
| Does `getteaminfolist` carry `GameID`?                      | **No** — it returns the array alone. `GameID` is reachable via `getallinfo` — [§3b](#3b-getallinfo-undocumented-and-the-one-we-should-actually-poll).                |
| Is the API loopback-only?                                   | **No.** `listen(10086)` with no host binds all interfaces.                                                                                                           |
| Is `getkillinfo` cumulative or recent-only?                 | **Cumulative, newest-first, never cleared** between matches — [§5](#5-the-remaining-live-endpoints).                                                                 |
| How many endpoints are there?                               | **62**, not thirteen. The route table is the `app` object itself.                                                                                                    |

**What remains is exactly the set of questions ob.js cannot answer**, and for a precise reason: it
never inspects the payload. It renames one key and re-serialises. Everything still open lives inside
that opaque blob and belongs to the game client.

**None of it blocks starting the adapter**, and 1–4 are all answered by the same single capture — one
PCOB client, one rehearsal room, two responses a few seconds apart, saved to disk. The split
treatment in [§7.1](#71-parse-tolerantly-at-the-boundary-validate-strictly-after-mapping) exists
precisely so that being wrong about a field name is a logged warning rather than a dead overlay.

### Built 2026-08-18 — `PcobSource`

The adapter now exists (`backend/src/ingest/pcob/`), written against everything above.
[ADR-0006](../docs/adr/0006-pcob-ingestion-adapter-boundary.md) is what made that possible before a
capture: every unknown listed here is confined to one directory.

It was verified **end to end against the real `ob.js`** from the v4.3.0 package — the vendor's own
server, fed a match snapshot the way the game feeds it — rather than against a mock of our own
design. `GameID` arrived, `liveState: 6` rendered as `disconnected`, the disconnected player counted
as standing, and `killNumBeforeDie` produced the right elimination total where `killNum` had reset
to zero.

What remains genuinely untested is the one thing that cannot be faked: **whether the real game
client spells its fields the way the 3.0.0 dictionary says.** The adapter degrades an unreadable
field to a default plus one log line naming it, so a mismatch is a warning in the console rather
than a blank overlay — but until a capture confirms otherwise, prefer `INGEST_SOURCE=mock` for
anything going on air.
