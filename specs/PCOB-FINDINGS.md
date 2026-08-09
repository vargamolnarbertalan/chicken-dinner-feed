# PCOB Guideline — Findings Relevant to chicken-dinner-feed

Sources:

- `specs/_PCOB Guideline (Last updated 6th Jan 2026).pdf` (22 pages), extracted 2026-08-09
- `specs/PCOB_Tool_fejlesztes_thread.md` — client correspondence with Esport1 (Zsófia Berze),
  forwarded 2026-08-09, containing the PMNC observer setup notes

This document keeps **only** what affects how we build the app. Operator-facing setup steps
(hotkeys, camera controls, OB etiquette) are summarised at the end for the broadcast crew,
but they carry no engineering requirements.

> Status: **partial**. The client thread revealed the API's host and port, but the authoritative
> schema document is still access-restricted and the **live** data path remains unconfirmed — see
> [Open questions](#open-questions). Everything marked _(unverified)_ must be confirmed before we
> write ingestion code against it.

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

What this does **not** settle, and it matters:

- **`gettotalplayerlist` is described as a post-match endpoint.** Combined with the fact that
  `PlayerAfterMatchAPI` fields read `0` until the match ends (§2.3), the most likely reading is that
  this endpoint serves the **final/total player list**, and that live in-match data comes from a
  different endpoint on the same server. The client says as much: _"A dinamikus tabella része nem
  tudom még pontosan hogyan működik"_ — they do not yet know how the dynamic table works either.
- **No endpoint index is known.** Other routes on port 10086 are unknown but very likely to exist.
- **The JSON shape is unknown.** Field names, nesting, and whether the `PlayerBaseInfo` /
  `PlayerRealTimeAPI` / `PlayerAfterMatchAPI` grouping from §2 appears literally in the payload.

**Concrete next action, cheap and high value:** the moment anyone has a PCOB client running with
"API Enable" ticked and `launch.bat` open, probe the server — `GET /`, `GET /gettotalplayerlist`,
and a handful of guessed sibling routes — and capture one real response body. A single captured
payload would close most of the remaining open questions at once. This does not need the restricted
schema document.

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

| Field              | Notes for us                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `Location`         | Position. Not needed for the leaderboard overlay; needed later for a minimap overlay.                                     |
| `Health`           | Current HP. **Drives the health-bar column height in the overlay.**                                                       |
| `HealthMax`        | Denominator for the health percentage. Do not hardcode 100.                                                               |
| `LiveState`        | Alive / knocked / dead discriminator. **Drives the three colours in the ALIVE column.** Exact enum values _(unverified)_. |
| `KillNum`          | Eliminations. **Drives the ELIMS column.**                                                                                |
| `KillNumBeforeDie` | Kills the player had before dying — needed so a dead player's elims don't reset.                                          |

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
> column is therefore **not** directly available — it would have to be derived from `LiveState`
> transitions ourselves.

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

## 3. Team identity — the `TeamLogoAndColor.ini` mechanism

The PCOB client renders team logos and colours by reading a **local ini file** on each OB PC
(section 13 of the guideline). This is entirely in-game rendering and is _separate_ from our
overlay, but it matters for two reasons.

1. **The team number is our join key.** The ini maps `TeamNo=1..25` to a `TeamName`, and the
   guideline states in the hotkey section that "the team number will be also shown in the output
   data". So `TeamNo` is very likely the identifier we correlate teams on _(unverified)_.
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

### ⚠️ Scope note

`specs/APP-PLAN.md` specifies a full admin — colours, fonts, sizes, placement, animation controls,
multiple overlay types and instances, live previews. The client quote scopes round one to **colours
and fonts**, with the control panel as a future add-on.

These are not the same scope. Both readings are defensible — building the admin anyway is reasonable
if it is internal groundwork for the next engagement — but the difference is deliberate work that
was not quoted, and it should be a conscious decision rather than a drift. Flagged in
`docs/progression.md` under open decisions.

### Timeline

The client's stated usage window was **2026-06-02 to 2026-06-07**, with "end of May" as the target
delivery. **That window has passed** (this thread was forwarded on 2026-08-09). The next event date
is unknown and needs confirming before round 2 is prioritised.

### What the tool replaces

Today the observer opens `gettotalplayerlist` after the match, refreshes it a few times, saves the
JSON, converts it to CSV, pastes it into a Google Sheet and arranges it by hand — all after the fact.
There is currently **no live solution at all**.

Two things follow. First, even a modest live overlay is a large step up from the status quo. Second,
a **post-match export** (final standings as CSV or a sheet-ready table) maps directly onto a workflow
they already perform manually, and is likely worth more than its cost. Recorded as a backlog item.

---

## Open questions

Updated 2026-08-09 after the client thread. Transport, host and port are now **answered** (§1.1);
what remains is the payload and the live path.

### Answered

- ~~Transport~~ — HTTP over loopback.
- ~~Host and port~~ — `127.0.0.1:10086`.
- ~~Response format~~ — JSON.

### Still open

1. **🟠 The live data path is unconfirmed.** `gettotalplayerlist` is described as a **post-match**
   endpoint. We do not know which route serves in-match state, or whether the same route simply
   returns live values while a match is running. The client does not know either.
   **Resolvable without the schema document** by probing port 10086 against a running PCOB client.
2. **🟠 The JSON payload shape is unknown.** Field names, nesting, whether the
   `PlayerBaseInfo` / `PlayerRealTimeAPI` / `PlayerAfterMatchAPI` grouping appears literally, and:
   - **Enum values** for `LiveState` (alive / knocked / dead / disconnected?).
   - **Identity fields**: how players and teams are keyed (`TeamNo`? `uId`? player name?).
   - Whether a match/round identifier is present.
     **One captured real response would answer all of this.**
3. **🔴 The API schema document is still not readable.**
   `https://docs.google.com/spreadsheets/d/1__DWeOyhrNs4PdXs9EoWwXdylU-CMICOQ-yNpw3Ag34/edit?gid=0`
   returns **HTTP 401** (CSV export, gviz and htmlview all tried). Access has been requested by the
   client as of 2026-08-09. It would answer questions 1 and 2 authoritatively, including endpoints
   nobody has thought to probe.
4. Does the API signal match start / match end, or must we infer it from `PlayerAfterMatchAPI`
   becoming non-zero?
5. Is `KillNum` reset per match, and does it include knockdowns that a teammate finished?
6. What polling interval is safe? The guideline warns about server overload from too many PCOB
   clients with "API Enable" ticked; it says nothing about request rate against the local endpoint.
   Since the upstream refreshes every ~2 s, polling faster than that gains nothing — see
   [ADR-0010](../docs/adr/0010-poll-the-pcob-http-api.md).
7. The _PCOB update note_ and _account application guide_ Google Docs remain unverified for
   engineering content — likely operator-only, low priority.

**Mitigation while blocked:** the ingestion layer sits behind an adapter interface with a
**mock/replay source** as the first implementation, so the overlay, scoring and admin can be built
and demoed end-to-end without the real API. See
[ADR-0006](../docs/adr/0006-pcob-ingestion-adapter-boundary.md).

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
