# Changelog

All notable changes to chicken-dinner-feed are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows
[Semantic Versioning](https://semver.org/), per
[ADR-0009](docs/adr/0009-git-workflow-and-release-process.md).

Entries are written for the person unpacking a release ZIP, not reconstructed from `git log` at
release time — add to `[Unreleased]` in the same change that makes the change.

## [Unreleased]

### Added

- Multi-map series scoring (see ADR-0015): a new **Series control** admin page tracks points across
  an entire tournament rather than one map at a time. A map closes automatically once the match
  data confirms it has ended, or manually from the new page; either way its final placements,
  eliminations and points are recorded permanently, with start/end times shown in your own time zone
  and a duration. Past maps can be corrected or deleted if auto-detection got one wrong. A series can
  be reset at any time — this clears the recorded history only, not whatever map is currently being
  played.
- The PTS column now reflects the whole series: points already banked in earlier maps, plus this
  map's own eliminations, plus a **guaranteed-minimum** placement credit for any team still alive
  (the worst position it could still possibly finish in, given how many teams remain) — so the
  leaderboard reflects a team's real standing sooner than waiting for it to actually place.

## [1.0.2] - 2026-08-29

### Changed

- `HOST` now defaults to `0.0.0.0` (every network interface) instead of `127.0.0.1`, so a Stream
  Deck / Companion box on another machine works with no `.env` change. **This also exposes the
  admin UI — which has no authentication — to everyone on the network by default**; the existing
  startup warning now fires on a fresh install rather than only after an explicit opt-in. Set
  `HOST=127.0.0.1` in `backend\.env` to restrict it to this machine, as before.
- `INGEST_SOURCE` now defaults to `pcob` (the real observer API) instead of `mock`, now that a live
  match capture has confirmed the real client's field spellings (see `specs/PCOB-API.md` §8). `mock`
  remains available for rehearsing overlay setup without a running match.
- The startup log always prints `http://localhost:<port>` regardless of the configured `HOST`, since
  that is the address an operator actually opens in a browser on this machine.

## [1.0.1] - 2026-08-29

### Fixed

- The `v1.0.0` release ZIP shipped a full `node_modules` and three seeded
  `backend/data/*.json` files — the smoke test added for that release installed and booted the app
  directly inside the bundle that then got zipped, rather than a disposable copy. **If you
  downloaded `v1.0.0`, re-download `v1.0.1` instead** — the packaging is fixed, nothing about the
  application itself changed. The release workflow now runs its install/boot checks against a
  copy of the bundle, and independently re-checks the final ZIP's contents before publishing.
- `/api/health` and `/feedback` reported a hardcoded `"0.1.0"` regardless of the actual release
  version, in every release so far. The version is now read from `package.json` at startup instead
  of a hand-copied literal.
- The bundle-assembly step's own smoke test (installing and booting the app to verify it works)
  would flag `backend/data/fonts` and `backend/data/logos` as unexpected contamination, since
  `LogoStore`/`FontStore` create them on first run — a third instance of the same class of bug as
  the `node_modules` one above. Caught by CI before anything was published.

## [1.0.0] - 2026-08-29

The first tagged release. **Known issue, fixed in 1.0.1:** the published ZIP for this version
shipped `node_modules` and seeded config files it should not have — see 1.0.1's entry. The
"no bundled `node_modules`" line below described the intent correctly; the release pipeline that
was supposed to guarantee it had a gap.

### Added

- Live-updating leaderboard overlay (rank, team logo, per-player health/alive state, points,
  eliminations), animated, resolution-independent from 1080p to 4K.
- Admin UI: overlay instance management, appearance editor with a live preview, team roster editor
  with logo upload and one-click `TeamLogoAndColor.ini` import, scoring ruleset editor, custom font
  upload.
- Real PCOB ingestion (`PcobSource`), verified against a live match; a deterministic mock source for
  development and rehearsal without a running game.
- `/feedback` endpoint and HTTP overlay control for Stream Deck / Companion integration.
- Bilingual (EN/HU) operator documentation and an all-in-one Windows bundle
  (`install-dependencies.bat` + `startup.bat`), installed and started with no bundled `node_modules`
  or copy of Node itself — `install-dependencies.bat` resolves those on the operator's machine, and
  skips reinstalling when nothing has changed.
- A hardened release pipeline: the published bundle is smoke-tested (installed and booted) and its
  runtime dependencies audited before publishing, and the tag is checked against `package.json`
  before anything is built.

### Fixed

- Team placement now trusts PCOB's own `rank` field instead of only an internal elimination-order
  guess, and a roster team that never joined a match no longer outranks one that did.

[Unreleased]: https://github.com/vargamolnarbertalan/chicken-dinner-feed/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/vargamolnarbertalan/chicken-dinner-feed/releases/tag/v1.0.2
[1.0.1]: https://github.com/vargamolnarbertalan/chicken-dinner-feed/releases/tag/v1.0.1
[1.0.0]: https://github.com/vargamolnarbertalan/chicken-dinner-feed/releases/tag/v1.0.0
