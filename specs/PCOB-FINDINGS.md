# PCOB Guideline — Findings Relevant to chicken-dinner-feed

Source: `specs/_PCOB Guideline (Last updated 6th Jan 2026).pdf` (22 pages), extracted 2026-08-09.
This document keeps **only** what affects how we build the app. Operator-facing setup steps
(hotkeys, camera controls, OB etiquette) are summarised at the end for the broadcast crew,
but they carry no engineering requirements.

> Status: **partial**. The authoritative API schema document is access-restricted — see
> [Open questions](#open-questions). Everything below marked _(unverified)_ must be confirmed
> against that document before we write ingestion code against it.

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

---

## Open questions

These block real ingestion work and need answers before [ADR-0006](../docs/adr/0006-pcob-ingestion-adapter-boundary.md) can be closed out.

1. **🔴 BLOCKER — The API schema document is not publicly readable.**
   The guideline links the English API spec at
   `https://docs.google.com/spreadsheets/d/1__DWeOyhrNs4PdXs9EoWwXdylU-CMICOQ-yNpw3Ag34/edit?gid=0`
   which returns **HTTP 401** to unauthenticated access (tried CSV export, gviz and htmlview
   endpoints). We need this exported, or shared with an account that can read it. Without it we do
   not know:
   - **Transport**: WebSocket, TCP socket, HTTP polling, or local file tailing?
   - **Host/port** the `launch.bat` process listens on, and whether it is configurable.
   - **Payload envelope**: message types, JSON shape, field naming, nesting.
   - **Enum values** for `LiveState` (alive / knocked / dead / disconnected?).
   - **Identity fields**: how players and teams are keyed (`TeamNo`? `uId`? player name?).
   - Whether a match/round identifier is present, and how match start/end is signalled.
2. The _PCOB update note_ and _account application guide_ Google Docs are also linked but
   unverified for engineering content — likely operator-only, low priority.
3. Does the API emit any event for match start / match end, or must we infer it from
   `PlayerAfterMatchAPI` becoming non-zero?
4. Is `KillNum` reset per match, and does it include knockdowns that a teammate finished?

**Mitigation while blocked:** the ingestion layer is being designed behind an adapter interface
with a **mock/replay source** as the first implementation, so the overlay, scoring and admin can be
built and demoed end-to-end without the real API. See
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
