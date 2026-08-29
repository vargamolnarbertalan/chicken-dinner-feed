# ADR-0017: Import & Export carries every setting as one backup ZIP

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude
- **Supersedes / Superseded by:** —

## Context

An operator's configuration lives as several JSON documents plus binary files
(`backend/data/*.json`, `backend/data/logos/`, `backend/data/fonts/`) — deliberately split apart
(ADR-0004) so one edit cannot corrupt an unrelated document. Moving that setup to a different
machine — a new venue PC, a fresh install after a crash, handing the show to a co-operator — meant
manually copying the right files out of `backend/data`, hoping nothing was missed and nothing was
copied that should not travel (the venue-specific `.env`).

## Decision

A new **Import & Export** admin page (after Series control) turns the whole of `backend/data` that
is safe to move into **one backup ZIP**, downloadable and re-importable in a couple of clicks.

- **Everything that is meant to travel, travels**: overlay instances (appearance, colours,
  animations), the team roster and its logo files, the scoring ruleset, custom fonts and their font
  files, and the full series/map history.
- **What is deliberately excluded, and why:**
  - `backend/.env` — machine-specific (network binding, the PCOB API's address). Copying it verbatim
    could silently point the new machine at the wrong observer or the wrong port.
  - Overlay show/hide state — there is nothing to export. ADR-0012 already never persists it: "a
    restart should give a known state, not resurrect whatever was on screen."
  - Live match/ingest state — a match in progress is not a setting.
- **Import is two calls to the same endpoint**, not a stateful multi-step upload. The first
  (`confirm` absent) validates the whole ZIP and returns a summary — never writing anything — so the
  admin can show the operator a confirmation dialog with something concrete ("16 teams, 45 finished
  maps, exported 2026-08-29") before anything is overwritten. The second, with `confirm=true`,
  re-uploads the same small file and actually applies it. No server-side staging between the two
  calls, at the cost of uploading twice — acceptable for a file this size.
- **Every document is migrated and validated exactly the way one loaded from disk normally is**
  (`JsonDocument`'s own `migrate` functions, reused directly) — an older backup from a previous app
  version is upgraded forward the same way an old `backend/data` file already is, not rejected.
- **Every file a document refers to must actually be in the archive** — a team's logo, a custom
  font's own file — checked before anything is written. A single missing or malformed entry fails the
  whole import with a specific message; nothing is ever half-imported.
- **Import replaces, it does not merge.** Existing logo/font files not present in the imported backup
  are deleted, matching the plain intent of "load everything this backup contains" — a stale,
  orphaned file from before the import must not linger and be mistaken for still-current.
- **Config documents are written through `ConfigStore`'s own existing save methods**
  (`saveTeams`/`saveScoring`/`saveInstances`/`saveFonts`), not a new write path — the existing
  `configStore.subscribe` listener in `app.ts` already refreshes the roster, ruleset and every open
  browser source for a normal operator edit, and an import gets that for free. Only the series
  history bypasses `ConfigStore` (`SeriesStore.replaceState`, new), so it needs the same explicit
  refresh `onSeriesChanged` already performs for other series actions.

## Consequences

### Positive

- One file, one click, everything an operator actually configured — no more "did I copy the logos
  too?" checklist.
- Reuses, rather than duplicates, every existing validation and live-refresh path (`JsonDocument`'s
  migrations, `ConfigStore`'s save methods and listeners).
- A corrupt or incomplete backup fails loudly, with a specific reason, before touching anything —
  matching the same philosophy `JsonDocument.load()` already applies to a single file.

### Negative / costs accepted

- Uploads the file twice (validate, then apply) rather than staging it server-side between the two
  calls. Simpler and stateless; acceptable given the file sizes involved (logos and a handful of
  fonts, typically low tens of MB at most).
- After a successful import, the admin reloads the whole page rather than patching every piece of
  local state an import can touch (overlays, teams, scoring, fonts, series) — simpler and more
  reliable than keeping many components' local state in sync with a wholesale restore.

### Neutral

- Uses `adm-zip` (new backend dependency) — a plain, dependency-free ZIP reader/writer, small enough
  a job this size does not need a streaming archiver.

## Alternatives considered

**Copy `backend/data` by hand, document how.** The status quo. Rejected: exactly the error-prone
process this decision replaces.

**Merge on import instead of replace.** Rejected for the primary use case this was built for — a
fresh install taking on a previous machine's full setup — where a merge's semantics (which team wins
a `teamNo` collision? which overlay wins an `id` collision?) are more to get wrong than a plain,
predictable replace.

**Stage the uploaded file server-side between preview and confirm**, so a large file uploads once.
Rejected for now: more moving parts (a temp file, an expiry, a token identifying it) for a benefit
that does not matter yet at these file sizes.

## Revisit when

- The backup ever needs to be partial (just teams, just one overlay) rather than all-or-nothing.
- File sizes grow enough that uploading twice becomes a real cost, not a rounding error.
