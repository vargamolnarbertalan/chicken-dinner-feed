# Changelog

All notable changes to chicken-dinner-feed are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows
[Semantic Versioning](https://semver.org/), per
[ADR-0009](docs/adr/0009-git-workflow-and-release-process.md).

Entries are written for the person unpacking a release ZIP, not reconstructed from `git log` at
release time — add to `[Unreleased]` in the same change that makes the change.

## [Unreleased]

## [1.0.1] - 2026-08-29

### Fixed

- The `v1.0.0` release ZIP shipped a full `node_modules` and three seeded
  `backend/data/*.json` files — the smoke test added for that release installed and booted the app
  directly inside the bundle that then got zipped, rather than a disposable copy. **If you
  downloaded `v1.0.0`, re-download `v1.0.1` instead** — the packaging is fixed, nothing about the
  application itself changed. The release workflow now runs its install/boot checks against a
  copy of the bundle, and independently re-checks the final ZIP's contents before publishing.

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

[Unreleased]: https://github.com/vargamolnarbertalan/chicken-dinner-feed/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/vargamolnarbertalan/chicken-dinner-feed/releases/tag/v1.0.1
[1.0.0]: https://github.com/vargamolnarbertalan/chicken-dinner-feed/releases/tag/v1.0.0
