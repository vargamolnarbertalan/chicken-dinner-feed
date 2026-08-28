# Changelog

All notable changes to chicken-dinner-feed are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows
[Semantic Versioning](https://semver.org/), per
[ADR-0009](docs/adr/0009-git-workflow-and-release-process.md).

Entries are written for the person unpacking a release ZIP, not reconstructed from `git log` at
release time — add to `[Unreleased]` in the same change that makes the change.

## [Unreleased]

## [1.0.0] - 2026-08-29

The first tagged release.

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

[Unreleased]: https://github.com/vargamolnarbertalan/chicken-dinner-feed/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/vargamolnarbertalan/chicken-dinner-feed/releases/tag/v1.0.0
