# ADR-0004: JSON files on disk for persistence, no database

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude

## Context

`specs/APP-PLAN.md` states that only configuration and preferences need to be persisted, that
secrets probably do not need storing at all, and that JSON read/write is sufficient for a localhost
deployment. [ADR-0001](0001-local-windows-bundle-over-cloud-stack.md) confirmed the localhost
deployment.

What we actually persist:

- overlay instance definitions (type, theme, colours, fonts, sizes, placement, animation settings);
- the team roster (team number → display name → logo file), see `specs/PCOB-FINDINGS.md` §3;
- the scoring ruleset (placement points table, points per elimination) — required because the PCOB
  API does **not** supply points, see `specs/PCOB-FINDINGS.md` §2.4;
- ingestion source configuration (which adapter, connection parameters).

This is a handful of small documents, read at startup, written when an operator clicks Save. There
is no querying, no reporting, no concurrent writers, and no growth over time.

## Decision

Persist to **JSON files under `backend/data/`**, one file per aggregate. All access goes through a
small **repository layer** — nothing else in the codebase touches the filesystem or knows the
storage format.

Rules the repository layer enforces:

- **Schema-validated on read and write** using the shared Zod contracts
  ([ADR-0005](0005-monorepo-with-shared-contracts.md)). A corrupt or hand-edited file is rejected
  loudly at startup, not silently half-loaded mid-broadcast.
- **Atomic writes**: serialise to a temporary file in the same directory, `fsync`, then rename over
  the target. A power cut during a save must never leave a truncated config.
- **Schema version field** in every document, so a future bundle can migrate an operator's existing
  configuration forward instead of discarding it.
- **In-memory as the source of truth at runtime**; disk is written on change. The live path never
  blocks on I/O.
- `backend/data/` is **git-ignored**; `backend/data/defaults/` holds committed seed documents that
  are copied on first run.

**Live match telemetry is not persisted.** It is ephemeral in-memory state. Match history and
after-match statistics are out of scope for v1.

## Consequences

### Positive

- Zero infrastructure: no server, no driver, no migrations, no `install-dependencies.bat` step.
- An operator can back up, copy, diff or hand-edit their configuration — genuinely useful when
  moving a setup between production machines, and easy to support over the phone.
- Configuration is human-readable, which makes bug reports far easier to act on.

### Negative / costs accepted

- **No transactions across files.** Accepted: our writes are per-aggregate and operator-initiated.
- **No concurrent-write safety** beyond a single process. The bundle runs one backend; the
  repository serialises writes per file **within that process** (see the amendment below — this
  was aspirational until 2026-08-30, not actually true). Running two instances against one data
  directory is still unsupported and should be prevented by a startup lock file.
- **No query capability.** Irrelevant at this data size; everything is loaded into memory.
- Rewriting a whole document per save does not scale — fine for kilobyte-sized configs.

### Neutral

- The repository boundary means a future SQLite or Postgres backing store is a change in one layer,
  not a rewrite. That is a side benefit, not a goal — see the rejection of speculative cloud
  abstraction in [ADR-0001](0001-local-windows-bundle-over-cloud-stack.md).

## Alternatives considered

**SQLite.** Would give atomicity and concurrency for free and needs no server. Rejected because it
costs a native dependency in a Windows bundle installed by a non-developer, and because it makes
configuration opaque to the operator — losing the "copy the JSON to the other PC" property that is
actually valuable here. Reasonable to revisit if we ever store match history.

**In-memory only, re-configured each session.** Rejected outright: operators must not rebuild their
overlay setup before every broadcast.

**`localStorage` in the browser.** Rejected: configuration would be trapped in one browser profile
and invisible to the backend, which needs the scoring ruleset and team roster server-side.

## Amended 2026-08-30 — concurrent writes within one process actually serialized

"The repository serialises writes per file" above described the intent, not the implementation.
`JsonDocument.write()` named its temp file `${filePath}.${process.pid}.tmp` — identical for every
call from the same process — and had no queue: two overlapping `write()` calls on one instance could
open/truncate/rename the same temp file out from under each other. Reproduced directly (two writes
fired without an `await` between them): the second's `rename` failed with `ENOENT`, and worse, the
in-memory `current` value ended up describing a _different_ write than the one that actually landed
on disk — a real, silent divergence between what the app believed and what was persisted.

Found reviewing `SeriesStore` after adding automatic map-closing that runs once per ingest poll
(see ADR-0015's amendments) — frequent enough, alongside a manual click, to make two overlapping
`write()` calls plausible in practice rather than purely theoretical. Fixed with an in-process queue:
each `write()` call now waits for every earlier one on the same instance to settle, success or
failure, before its own temp-file dance begins. A failed write does not wedge the queue — only the
internal chain link swallows its rejection, never the promise the caller itself awaits.

This closes the _corruption_ half of the risk for every `JsonDocument`-backed store, generally.
`SeriesStore` additionally serializes its own read-then-write bodies (not just the underlying write)
behind the same pattern, because the write-level queue alone does not stop a second mutation from
_reading_ a stale `current` before the first one's write has landed and building a duplicate entry
from it — see ADR-0015's amendment for that half, specific to series-history mutations.

## Revisit when

- We start storing per-match history or statistics.
- Anything needs to be queried rather than loaded whole.
- Secrets ever need to be stored, at which point plain JSON on disk stops being adequate.
