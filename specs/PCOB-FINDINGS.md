# PCOB Guideline — Findings Relevant to chicken-dinner-feed

Sources:

- `specs/_PCOB Guideline (Last updated 6th Jan 2026).pdf` (22 pages), extracted 2026-08-09
- `specs/PCOB_Tool_fejlesztes_thread.md` — client correspondence with Esport1 (Zsófia Berze),
  forwarded 2026-08-09, containing the PMNC observer setup notes

This document keeps **only** what affects how we build the app. Operator-facing setup steps
(hotkeys, camera controls, OB etiquette) are summarised at the end for the broadcast crew,
but they carry no engineering requirements.

> **The wire format now lives in [`PCOB-API.md`](PCOB-API.md).** Two API documents arrived on
> 2026-08-17 and answered most of what this document could only guess at: the endpoint list, the
> payload shape, the `liveState` enum, the identity fields and the match identifier. Where this
> document and that one disagree, **`PCOB-API.md` is correct** — the notes below marked
> ⚠️ **superseded** are kept only so the reasoning that led there stays legible.
>
> This document remains the authority on everything that is _not_ wire format: the access chain, the
> operational failure modes, team identity via the ini, broadcast constraints, and the client's
> product requirements.

---

## 1. What the data source actually is

The PCOB ("PC Observer") client is a **Windows desktop application** — a spectator build of the
PUBG Mobile game client (`ShadowTrackerExtra.exe`). It joins a tournament custom room as an
observer and exposes match telemetry through a local API process.

Key consequences for our architecture:

| Fact from the guideline                                                                                                                                                                  | Consequence for us                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The API is started by running `WinClient_OB_live\WinClient_OB\ObToolsNew\launch.bat` on the OB PC, and **that console must stay open** or the API stops.                                 | The data source is a **local process on the observer's Windows machine**. Our ingestion must run on, or on the same LAN as, that machine. A cloud-only backend cannot reach it. This is the primary driver behind [ADR-0001](../docs/adr/0001-local-windows-bundle-over-cloud-stack.md). |
| The **"API Enable" button must be clicked in the PCOB client before the match starts**.                                                                                                  | Our app must tolerate "no data yet" as a normal, expected state and surface it clearly to the operator, rather than treating it as an error. A pre-flight connection indicator in the admin is a real requirement, not a nicety.                                                         |
| "You are **not able to get any API data if the host is disconnected**." The host must stay online, and after a match ends the host should wait **≥30 seconds** before quitting the room. | Data loss mid-match is an expected failure mode outside our control. The overlay must **hold its last known good state** instead of blanking out, and the admin must distinguish "no data" from "stale data".                                                                            |
| "Please manage a reasonable PCOB amount which is allowed to click 'API Enable' for each event to avoid server overloading."                                                              | Multiple OB clients can emit the API stream. We should assume **one configured source per instance**, and not poll aggressively.                                                                                                                                                         |
| PCOB client may crash; the director switches to another OB.                                                                                                                              | Our ingestion needs **automatic reconnection with backoff**, and must not require an app restart when the source comes back.                                                                                                                                                             |

### 1.1 The API surface — a local HTTP server on port 10086

The client thread supplies what the guideline never states: the PCOB API is an **HTTP server on
`http://localhost:10086`**, and one concrete endpoint is named.

```
http://localhost:10086/gettotalplayerlist
```

The observer is instructed to open this **after a match ends** and refresh it repeatedly, then save
the JSON, convert it to CSV and paste it into a Google Sheet by hand. Replacing exactly that manual
chain is what this project is for.

What this settles:

|                   |                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Transport**     | HTTP over loopback — **not** a WebSocket, and not a file we tail. Our adapter polls. See [ADR-0010](../docs/adr/0010-poll-the-pcob-http-api.md) |
| **Host and port** | `127.0.0.1:10086`, on the observer PC                                                                                                           |
| **Format**        | JSON (the observer is told to save the response as JSON)                                                                                        |
| **Auth**          | None mentioned — a plain local endpoint                                                                                                         |

⚠️ **Superseded 2026-08-17** — everything below in this subsection was answered by the two new API
documents. See [`PCOB-API.md`](PCOB-API.md) for the endpoint list, the payload and the field
semantics. Two corrections in particular:

- **`gettotalplayerlist` is the _live_ endpoint**, not a post-match one. The guess below — that live
  data must come from some other route — was wrong. The observer's post-match use of it is a habit,
  not a limitation. What is genuinely post-match-only is the `PlayerAfterMatchAPI` _field group_
  inside the same response (§2.3, which stands).
- **The host is not necessarily loopback.** The guideline gives `http://<hostip>:10086/<geturl>`
  where `hostip` is the OB PC's address, so the API is LAN-reachable. The configurable base URL in
  [ADR-0010](../docs/adr/0010-poll-the-pcob-http-api.md) is therefore required, not a nicety.

_Original text, kept for the record:_

- **`gettotalplayerlist` is described as a post-match endpoint.** Combined with the fact that
  `PlayerAfterMatchAPI` fields read `0` until the match ends (§2.3), the most likely reading is that
  this endpoint serves the **final/total player list**, and that live in-match data comes from a
  different endpoint on the same server.
- **No endpoint index is known.**
- **The JSON shape is unknown.**

### 1.2 The access chain before any data exists

From the client thread. None of this is code, but all of it determines whether the app can receive
anything at all, so it belongs in the operator documentation and in how we report "no data".

1. Download the PCOB client files (Google Drive links held by the client).
2. First login is recommended via **email / password**. An observer without a PUBG Mobile account
   can start the game on mobile, choose **Guest login**, then attach an email and password.
3. Run the provided `.bat` file and read out the **OPENID** number.
4. The OPENID must be sent to the publisher for **whitelisting**. _Without whitelisting there is no
   API data at all._ The client recommends whitelisting **two accounts** for redundancy.
5. Only then: the observer joins the lobby through the ShadowTracker (PCOB) client, switches to
   observer mode, ticks **API ENABLE**, and runs
   `WinClient_OB_live\WinClient_OB\ObToolsNew\launch.bat` from a command prompt, leaving that window
   open for the whole session.

**Consequence for us:** "no data" has at least four distinct causes — not whitelisted, API Enable
not ticked, `launch.bat` not running, host disconnected. The admin's connection indicator should
help the operator tell them apart rather than just showing a red dot.

## 2. Data model — confirmed categories and update cadence

From the _PCOB API updated rules (2023.2.6)_ sheet, which **was** reachable. This is the single
most useful engineering artifact we have so far: it defines what fields exist and when they change.

The server collects data **every 2 seconds** and pushes to the PCOB client only when something
changed. So our effective input rate is **~0.5 Hz, event-driven, not a smooth stream**.

### 2.1 `PlayerBaseInfo` — changes almost every tick

| Field              | Notes for us                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Location`         | Position. Not needed for the leaderboard overlay; needed later for a minimap overlay.                                                                                           |
| `Health`           | Current HP. **Drives the health-bar column height in the overlay.**                                                                                                             |
| `HealthMax`        | Denominator for the health percentage. Do not hardcode 100.                                                                                                                     |
| `LiveState`        | Alive / knocked / dead discriminator. **Drives the three colours in the ALIVE column.** Enum values now confirmed — [`PCOB-API.md` §3](PCOB-API.md#livestate-the-enum-finally). |
| `KillNum`          | Eliminations. **Drives the ELIMS column.**                                                                                                                                      |
| `KillNumBeforeDie` | Kills the player had before dying — needed so a dead player's elims don't reset.                                                                                                |

> Cadence note: this category "usually will be updated in each 2 sec since player locations change
> frequently". Because `Location` churns constantly, **every** push will likely carry a full
> `PlayerBaseInfo` block even when health did not change. Our diffing must happen on **our** side,
> or we will re-render and re-animate the overlay twice a second for nothing.

### 2.2 `PlayerRealTimeAPI` — changes occasionally

`GotAirDropNum`, `MaxKillDistance`, `Damage`, `KillNumInVehicle`, `KillNumByGrenade`, `Rank`,
`IsOutsideBlueCircle`.

Same 2s collection, but "does not always change in each 2 seconds". `Rank` and `Damage` are the
interesting ones for future overlay types (damage leaderboard, live placement).

### 2.3 `PlayerAfterMatchAPI` — **zero until the match ends**

`InDamage`, `Heal`, `HeadShotNum`, `SurvivalTime`, `DriveDistance`, `MarchDistance`, `Assists`,
`OutsideBlueCircleTime`, `Knockouts`, `RescueTimes`, `UseSmokeGrenadeNum`, `UseFragGrenadeNum`,
`UseBurnGrenadeNum`, `UseFlashGrenadeNum`.

**Critical trap:** these fields are present but **hold `0` for the entire match** and are only
populated after it ends. Any overlay binding to them mid-match would silently display zeros.
Our contract layer should model these as "not yet available" rather than as numeric `0`.

> Note the naming asymmetry: `Knockouts` and `Assists` are **after-match only**. A live "knocks"
> column is therefore not available from _this_ field.
>
> ⚠️ **Partially superseded 2026-08-17.** It is available from elsewhere: `getkillinfo` streams
> knock and kill events live, with `ResultHealthStatus` = 1 for a knock and 2 for a kill
> ([`PCOB-API.md` §5](PCOB-API.md#5-the-remaining-live-endpoints)). Deriving knocks from `LiveState`
> transitions is no longer the only route.

### 2.4 What the example overlay needs vs. what the API gives

`specs/example.png` requires: rank, team logo, short name, alive-player bars with health, points,
eliminations.

| Overlay column  | Source                                                    | Status                                            |
| --------------- | --------------------------------------------------------- | ------------------------------------------------- |
| # (rank)        | Computed by us from points + elims + placement            | **Our logic**, not from API                       |
| Team logo       | Local image file, uploaded via admin                      | **Our storage**                                   |
| Team short name | Operator-configured mapping                               | **Our config**                                    |
| ALIVE bars      | `LiveState` + `Health` / `HealthMax` per player           | API ✅                                            |
| PTS             | Placement points + kill points per the tournament ruleset | **Our logic** — needs a configurable points table |
| ELIMS           | Sum of team members' `KillNum` / `KillNumBeforeDie`       | API ✅                                            |

**This is a significant scoping finding:** points and ranking are _not_ supplied by the API. We
need a configurable scoring ruleset (placement points table + points per kill) as a first-class
feature, not an afterthought.

⚠️ **One row corrected 2026-08-17.** _Points_ are still ours — the API supplies no points table and
cannot, since it is per-tournament. **Placement is not.** `rank` is documented as the team's
placement, `0` while still playing
([`PCOB-API.md` §6](PCOB-API.md#rank-changes-what-we-thought)). Our elimination-order tracking
becomes the fallback rather than the only source — pending one capture confirming that `rank`
populates during the match rather than only after it.

## 3. Team identity — the `TeamLogoAndColor.ini` mechanism

The PCOB client renders team logos and colours by reading a **local ini file** on each OB PC
(section 13 of the guideline). This is entirely in-game rendering and is _separate_ from our
overlay, but it matters for two reasons.

1. **The team number is our join key.** The ini maps `TeamNo=1..25` to a `TeamName`, and the
   guideline states in the hotkey section that "the team number will be also shown in the output
   data". **Confirmed 2026-08-17:** the payload carries `teamId`, and that is what we correlate on
   ([`PCOB-API.md` §3](PCOB-API.md#3-gettotalplayerlist)).
2. **Logo asset requirements are already defined**, and we should reuse the same convention so an
   operator can point our app at the same folder they already maintain:
   - `001.png` … `016.png` (up to `025.png`) at **256×256**
   - `001_64.png` at **64×64**
   - `001_128.png` at **128×128**
   - `001_256.png` at **256×256**

Sample ini line format:

```ini
[/Script/ShadowTrackerExtra.FCustomTeamLogoAndColor]
EnableTeamLogoAndColor=1
TeamLogoAndColor=(TeamNo=1,TeamName=AAA,TeamLogoPath=c:/logo/001.png,TeamColorR=0,TeamColorG=0,TeamColorB=255,TeamColorA=255,PlayerColorR=0,PlayerColorG=255,PlayerColorB=0,PlayerColorA=255,CornerMarkPath=,fin)
```

Colour fields are documented as **not functional in v1.1.0** — copy-paste them unchanged.
A newer addition allows `KillInfoPath=<logo path>` between `TeamLogoPath` and `TeamColorR` to show
team logos in kill messages.

### Corrected 2026-08-17 against the real v4.3.0 file

The PCOB client writes this file itself on first login, with a self-documenting header. Three
corrections to the above, all read out of the generated file rather than the guideline:

1. **The path is known directly.** No need for the guideline's §13 dance of running `Client.bat` and
   searching for `iniconfigpath`:

   ```
   %LOCALAPPDATA%\ShadowTrackerExtra\Saved\TeamLogoAndColor.ini
   ```

2. **The colours _do_ work in 4.3.0**, and the alpha channel is the switch. The generated header
   states: _"TeamColorR, TeamColorG, TeamColorB, TeamColorA for team color RGBA setting. **Use
   ingame setting when TeamColorA equals to 0**."_ So `TeamColorA=0` means "leave it to the game",
   and a non-zero alpha applies the operator's colour. The "not functional in v1.1.0" note is stale.
3. **Team names may not contain `=` or `,`** — the header says so explicitly. This is a real
   validation rule for the importer, since the format is comma-delimited with `=` pairs and a name
   containing either would corrupt the line.

**For the importer backlog item** this is good news: the file is at a fixed, predictable path, it
exists on every OB machine after first login, and it carries its own field documentation.

**Opportunity:** since the ini is a flat, well-formed text file listing team number → name → logo
path, our admin could _import_ an existing `TeamLogoAndColor.ini` to bootstrap the team roster in
one click instead of making the operator retype 16–25 teams. Cheap to build, high operator value.
Recorded as a backlog item, not first-round scope.

## 4. Broadcast constraints that touch our UI

These are compliance rules from the guideline that our overlay must not violate:

- **Never show dead bodies or skulls on stream** (PCOB setting: replace skull with tombstone).
- **Only green blood** (PCOB setting: damage effect → Green). Never red blood on stream.
- **Do not hide the PUBG MOBILE logo** without authorisation — so our overlay must not be
  positioned such that it covers the in-game PUBGM logo by default. Worth a default-placement
  sanity check in the admin preview.
- Match rooms are **16 teams × 4 players = 64 players**, with up to 25 team slots configurable in
  the ini and 30 OB slots per tournament card. Design the overlay for **up to 25 teams**, with 16
  as the common case.

## 5. Versions and moving parts

- PC OB Client **v4.3.0** (updated 11 Mar 2026) — distributed as 3 files via Google Drive, plus a
  `pak` patch file dropped into `%LOCALAPPDATA%\ShadowTrackerExtra\Saved\Paks`.
- Requires an **OPENID-based PCOB account**, only granted to authorised tournaments.
- Requires a **tournament room card** (not a normal/advanced room card) for full esports functions
  and 30 OB slots. Rooms can only be created from a mobile client, never from PC OB.
- Known runtime dependencies: Microsoft Visual C++ 2010 Redistributable, DirectX End-User Runtime.

Implication: the PCOB client version is **outside our control and updates independently**. Our
ingestion layer must be **defensive about unknown fields** — parse permissively, ignore extras,
never crash the overlay because a new field appeared.

## 6. Product requirements from the client

From `specs/PCOB_Tool_fejlesztes_thread.md`. Client: **Esport1**, contact **Zsófia Berze**; context
is PMNC. Not a first collaboration, and the work was quoted as a fixed-price engagement.

### What was quoted

| Committed                                                                                          | Notes                                                                                                                |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| User-centric usage documentation                                                                   | Delivered — `docs/user/user-guide.{en,hu}.md`                                                                        |
| A small web server that receives and processes the data                                            | ADR-0002                                                                                                             |
| A ready-to-use browser source with real-time data, usable in **all mainstream streaming software** | Standard browser source; nothing OBS-specific                                                                        |
| Overlay customisation limited to **colours and fonts** in the first round                          | See the scope note below                                                                                             |
| **Dynamic support for FullHD, 1440p and 4K**                                                       | **New requirement — not in APP-PLAN.md.** See [ADR-0011](../docs/adr/0011-resolution-independent-overlay-scaling.md) |

A **control panel** was explicitly framed as a _later_ extension to be discussed separately, not as
part of this engagement.

### Scope note — resolved 2026-08-09

`specs/APP-PLAN.md` specifies a full admin — colours, fonts, sizes, placement, animation controls,
multiple overlay types and instances, live previews. The client quote scopes round one to **colours
and fonts**, with the control panel as a future add-on.

**Decision: `APP-PLAN.md` wins.** We build the fuller admin, knowingly beyond the quoted scope, with
the **live overlay preview downgraded to nice-to-have**. The extra work is accepted as groundwork
rather than treated as drift.

### Timeline — resolved 2026-08-09

The client's stated usage window was 2026-06-02 to 2026-06-07; it has passed. **No date constraint
applies to the current work** — it is being built now because it is wanted now. Scheduling does not
enter into prioritisation.

### What the tool replaces

Today the observer opens `gettotalplayerlist` after the match, refreshes it a few times, saves the
JSON, converts it to CSV, pastes it into a Google Sheet and arranges it by hand — all after the fact.
There is currently **no live solution at all**.

Two things follow. First, even a modest live overlay is a large step up from the status quo. Second,
a **post-match export** (final standings as CSV or a sheet-ready table) maps directly onto a workflow
they already perform manually, and is likely worth more than its cost. Recorded as a backlog item.

---

## Open questions

Updated 2026-08-17 after the two API documents in `specs/new/`.

### Answered

- ~~Transport~~ — HTTP, `GET`, JSON.
- ~~Host and port~~ — port 10086 on the **OB PC**, which may or may not be loopback.
- ~~The live data path~~ — `gettotalplayerlist` **is** the live endpoint.
- ~~The endpoint index~~ — thirteen routes documented; see [`PCOB-API.md` §1](PCOB-API.md#1-transport).
- ~~The JSON payload shape~~ — [`PCOB-API.md` §3–5](PCOB-API.md#3-gettotalplayerlist), with the
  caveat in [§2](PCOB-API.md#2-the-two-shape-problem-solved-by-reading-the-server).
- ~~`LiveState` enum~~ — seven values, 0–6, including a `Disconnected` we did not model.
- ~~Identity fields~~ — `teamId` for teams; `playerKey` for players, with `uID` and `playerOpenId`
  alongside it.
- ~~Match identifier~~ — `GameID`, in `getteaminfolist` (documented in 3.0.0, not yet seen on the
  wire).
- ~~Match start / end signalling~~ (question 4) — `isingame`, plus `FightingStartTime` and
  `FinishedStartTime`. Not an inference from `PlayerAfterMatchAPI` going non-zero.
- ~~Live knock counts~~ — available from `getkillinfo`, not only from `LiveState` transitions.

### Still open

Wire-format questions have moved to
[`PCOB-API.md` §8](PCOB-API.md#8-what-is-still-missing), which is now the list to work from. All of
them close with **one captured response from a live match** — the same action this document has
recommended since 2026-08-09, now much better targeted.

What remains here, outside the wire format:

1. Is `killNum` reset per match, and does it count a knockdown a teammate finished? Answered by a
   capture, but only by watching one across a match boundary.
2. **🔴 The API schema spreadsheet still returns HTTP 401** (re-checked 2026-08-17, CSV export and
   gviz). Access was requested by the client on 2026-08-09. It is now **largely redundant** — the two
   PDFs cover what we needed it for.
3. What polling interval is safe? Unchanged: the upstream refreshes every ~2 s, so polling faster
   gains nothing — see [ADR-0010](../docs/adr/0010-poll-the-pcob-http-api.md).
4. The _PCOB update note_ and _account application guide_ Google Docs remain unverified for
   engineering content — likely operator-only, low priority.

**Mitigation while blocked:** the ingestion layer sits behind an adapter interface with a
**mock/replay source** as the first implementation, so the overlay, scoring and admin can be built
and demoed end-to-end without the real API. See
[ADR-0006](../docs/adr/0006-pcob-ingestion-adapter-boundary.md). That boundary is now doing exactly
the job it was designed for: the corrections above changed our understanding substantially, and
none of them touched a line of overlay, scoring or admin code.

---

## Appendix — operator reference (no engineering impact)

Kept here so the broadcast crew has one place to look; none of this constrains our code.

**Hotkeys.** `Tab` team status · `L` player menu · `M` map · `F` free/fixed camera · `V` back to
fixed · `X` transparency · `B` bullet path · `N` damage numbers · `J` replay timeline · `E` load
match result · `F6` hide all UI · `F7` esports livestream mode · `F8` hide kill messages ·
`F9` lock vehicle perspective · `F11` fullscreen · `Alt` show/hide cursor · `C` lock look-around ·
`PageUp`/`PageDown` switch player in team · `T`+`01..16` switch team · `Y`+`1..4` switch player ·
`B`+team number item info · `Shift`+`B` grenade info.

**Free camera.** `WSAD` move · arrows turn · `QE` vertical · `Shift` faster · `Ctrl` slower ·
`+`/`-` speed levels (10 levels; keyboard `+/-` for WASD, keypad `+/-` for turning).

**OB etiquette.** Never host from PC OB (a crash kills the whole room). Switch client language from
Chinese to English. Record every room ID. Never show graphic bugs, lag or unrendered geometry to
PGM. Wait for 3D rendering to complete before switching to PGM. Use transparency sparingly. Bullet
path only in bird view. Move the bird-view camera with the keyboard only, never the mouse. Do not
let players talk in the "All" voice channel — OBs hear it and it reaches the stream. Use a
dedicated OB for the map. Keep OB desktops clean with a PUBGM wallpaper in case of a crash.

**Known bug.** If the mouse cannot click "setting", press `F11` twice.

**Bug reports.** Send room ID, player IDs, date/time in **GMT+8**, description and video to the
Tencent PUBGM esports team.
