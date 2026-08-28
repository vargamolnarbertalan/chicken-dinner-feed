# Changelog

All notable changes to chicken-dinner-feed are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows
[Semantic Versioning](https://semver.org/) — pre-1.0, a breaking change bumps the **minor**, per
[ADR-0009](docs/adr/0009-git-workflow-and-release-process.md).

Entries are written for the person unpacking a release ZIP, not reconstructed from `git log` at
release time — add to `[Unreleased]` in the same change that makes the change.

## [Unreleased]

Everything below shipped before this project's first tagged release, and is grouped here as the
starting point for `v0.1.0`'s own entry once it is cut.

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
  (`install-dependencies.bat` + `startup.bat`).

### Fixed

- Team placement now trusts PCOB's own `rank` field instead of only an internal elimination-order
  guess, and a roster team that never joined a match no longer outranks one that did.

<!--
When cutting the first release: rename this section's heading to `## [0.1.0] - YYYY-MM-DD` (drop
"Unreleased" from both the heading and this comment), add a fresh empty `## [Unreleased]` above it,
and add the compare link below once the tag exists:
[0.1.0]: https://github.com/vargamolnarbertalan/chicken-dinner-feed/releases/tag/v0.1.0
-->
