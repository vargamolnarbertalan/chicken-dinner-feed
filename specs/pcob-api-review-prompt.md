Adversarial review. Find what is wrong with this artifact. Assume the author is overconfident.
Look for:

- Unstated assumptions
- Claims the cited evidence does not actually support
- Edge cases not handled
- Ways the contract could be violated
- Failure modes under unexpected input

Do NOT validate. Do NOT summarize. Find issues, or state explicitly that you cannot find any after
thorough examination.

---

## CONTRACT

An engineer will write a polling HTTP adapter against the PCOB (PUBG Mobile PC Observer) local API
using only the conclusions below. The adapter feeds a live broadcast leaderboard overlay showing, per
team: rank, short name, per-player alive/knocked/dead bars with health, total eliminations, and
points. It runs unattended inside a broadcast for hours. A wrong conclusion here shows up as wrong
numbers on air, or a blank overlay, with no operator able to debug it mid-show.

Constraints:

- No live capture of a real API response exists. Everything below is derived from vendor PDFs.
- The upstream refreshes every ~2 seconds; the adapter polls once per second.
- The overlay must hold last-known-good state rather than blank when the source drops.
- Where two vendor documents conflict, the newer is taken as correct (operator's decision).

## ARTIFACT — the conclusions drawn from the vendor documents

### Available evidence

- **Doc A**: an "Interface Guideline" section containing concrete JSON response samples. Its content
  is from API version 1.5.0.
- **Doc B**: a field dictionary for API version 3.0.0, in the _same PDF_ as Doc A. Lists field names
  and meanings. Contains no JSON samples.
- **Doc C**: a separate, older PDF (Feb 2023) describing which fields update when.

### Conclusions

1. Transport is `GET http://<hostip>:10086/<route>`, JSON, no authentication, where `<hostip>` is the
   observer PC's address (so LAN-reachable, not loopback-only).

2. `gettotalplayerlist` is the LIVE endpoint, not a post-match one. Evidence: Doc C states that the
   `PlayerAfterMatchAPI` field group "will keep 0 before game ends"; that group lives inside the
   `gettotalplayerlist` payload alongside two other groups that Doc C describes as updating every
   2 seconds during play.

3. Doc A and Doc B disagree on field names for the same endpoint: envelope `playerInfoList` (A) vs
   `TotalPlayerList` (B); `surviceTime` (A) vs `survivalTime` (B); `isOutSideBlueCircle` (A) vs
   `isOutsideBlueCircle` (B); `posX`/`posY`/`posZ` (A) vs `location` (B). Resolution: Doc B (3.0.0,
   newer) is primary, Doc A names are accepted as legacy aliases. The adapter looks fields up
   case-insensitively through an ordered alias list and tolerates missing keys.

4. `liveState` is an integer enum, identical in both docs: 0 Normal, 1 On Plane, 2 On Parachute,
   3 On Vehicle, 4 DBNO (knocked), 5 Dead, 6 Disconnected.

5. `playerKey` is the canonical player identifier. Evidence: three other endpoints
   (`getteambackpackinfo`, `getplayerweapondetailinfo`, `getplayerssightusageinfo`) key on
   `PlayerKey`. `uID` and `playerOpenId` also exist; `playerOpenId` is the account-level id used for
   tournament whitelisting.

6. `rank` is the TEAM's final placement, `0` while still playing. Doc A's table says: "Team rank.
   '0' mean still playing. >1 is the ranking of that game." Doc C files `Rank` under the
   `PlayerRealTimeAPI` group rather than the after-match group, which is taken as evidence that it
   populates DURING the match, not only after it. Therefore `rank` becomes the primary source of
   placement, with our own elimination-order tracking as fallback.

7. No field in any document gives a player's slot/position within their team (1–4). The overlay
   needs one to pin each player to a fixed bar. Conclusion: derive it ourselves — ascending
   `playerKey` within `teamId`, assigned on first sight and frozen for the match. Array order is
   rejected as the primary rule because no document states the order is stable.

8. A single response can mix data generations. Evidence: Doc C says the game server sends three field
   groups to the observer client over TWO independent channels, and the client re-posts its
   `gettotalplayerlist` document on receiving ANY group. So `health` may be from one tick and
   `damage` from another.

9. `killNumBeforeDie` (kills held at death) is live, not post-match — Doc C files it under
   `PlayerBaseInfo`. It is absent from Doc A's sample, so the adapter treats it as optional and
   falls back to the last `killNum` observed while the player was alive.

10. Live knock-down counts are obtainable from a separate `getkillinfo` endpoint returning events
    with `ResultHealthStatus` 1 = knocked, 2 = killed. Those events identify players by NAME, not by
    `playerKey`.

11. Team-level `killNum` and `liveMemberNum` are available from `getteaminfolist`, but the adapter
    computes both itself from the player list and uses the endpoint values only as a cross-check.

12. `isingame` returns `{"isInGame": true}` and is the match-phase signal. Doc B additionally places
    `GameID`, `GameStartTime` (documented as ELAPSED seconds, despite the name), `FightingStartTime`,
    `FinishedStartTime` and `CurrentTime` at the top level of `getteaminfolist`.
