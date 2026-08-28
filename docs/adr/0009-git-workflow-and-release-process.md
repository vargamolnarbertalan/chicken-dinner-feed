# ADR-0009: feat → develop → main with tagged all-in-one bundle releases

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude

## Context

`specs/APP-PLAN.md` prescribes the workflow directly: `feat` → `develop` → `main`, release tagging
on `main`, conventional commit messages, and merges via pull request. It also requires that the
release artifact for a local deployment is a ZIP attached to the GitHub release, excluding
everything irrelevant to running the app — and, per the plan's _all-in-one bundle_ section, that the
ZIP contains `install-dependencies.bat` and `startup.bat` for the operator.

The distinguishing constraint is the audience: the artifact is unpacked and run by a **broadcast
operator, not a developer**, often shortly before going on air.

## Decision

### Branching

- `main` — release-ready only. Every commit on `main` is a tagged, releasable state. Protected.
- `develop` — integration branch. Feature work merges here first.
- `feat/*`, `fix/*`, `chore/*`, `docs/*` — short-lived, branched from `develop`, merged back by PR.
- `hotfix/*` — branched from `main` for urgent production fixes, merged to `main` **and** back into
  `develop`.

All merges go through pull requests. Direct pushes to `main` and `develop` are not used.

### Commits

**Conventional Commits.** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`,
with the workspace as an optional scope: `feat(overlay): animate rank reordering`. Breaking changes
use `!` and a `BREAKING CHANGE:` footer.

This is not decoration — it is what lets the changelog be generated and the version bump be derived
rather than argued about.

### Versioning and releases

**Semantic versioning**, tagged `vMAJOR.MINOR.PATCH` on `main`. Pre-1.0, breaking changes bump the
minor. The root `package.json` version is the single source of truth; workspaces inherit it.

> **2026-08-29:** the first release was cut as `v1.0.0` directly, on the operator's decision, rather
> than starting at `0.1.0` — the app had already been verified against a real live match by then.
> Normal semver applies from here: a breaking change bumps the major.

A release is **triggered manually by pushing a tag** — deliberately not automatic on merge, because
releasing should be a decision made when the operator is ready, not a side effect of merging.

The release workflow produces the **all-in-one bundle ZIP**:

- production dependencies and the built backend;
- the built frontend (static assets);
- `install-dependencies.bat` and `startup.bat` at the root of the ZIP;
- default configuration seeds and the EN/HU user documentation;
- **excluded**: `specs/`, `docs/adr/`, tests, source maps, dev dependencies, `.git`, `node_modules`
  for dev-only packages, and the operator-specific `backend/data/` contents.

The ZIP is attached to the GitHub release along with generated release notes.

## Consequences

### Positive

- The plan's workflow is followed exactly, and it is a well-understood model.
- Conventional commits give changelog generation and version derivation for free.
- A manual tag trigger means no accidental release during a broadcast week.
- The operator downloads one file, unpacks it, and has everything — matching the bundle requirement.

### Negative / costs accepted

- Git flow's two long-lived branches carry merge overhead that trunk-based development avoids.
  Accepted because the plan asks for it and because `main` staying always-releasable is genuinely
  valuable when releases go to live production environments.
- PRs on a single-developer project are ceremony. They are also the only place a review of the
  diff happens, so they stay.
- ~~Bundling `node_modules` makes the ZIP large.~~ **Revised 2026-08-28** — the release workflow
  never actually bundled `node_modules`: it ships only the built `dist/` output plus a generated
  `package.json` and lockfile scoped to the backend's runtime dependencies, and
  `install-dependencies.bat` installs them on the operator's machine on first run (and, since the
  same date, skips reinstalling when nothing has changed — see below). This line was aspirational
  and never matched the implementation; corrected here rather than left to mislead the next reader.

### Neutral

- Because backend and frontend release together as one artifact
  ([ADR-0005](0005-monorepo-with-shared-contracts.md)), one version number covers everything.

## Alternatives considered

**Trunk-based development with release branches.** Less overhead and generally preferable for
continuous deployment — but this project ships discrete artifacts to operators, not a continuously
deployed service, and the plan specifies otherwise.

**Automatic release on every merge to `main`.** Rejected: releases must be deliberate.

**Publishing a container image to GHCR.** Rejected as a consequence of
[ADR-0001](0001-local-windows-bundle-over-cloud-stack.md) — there is no container.

**A Windows installer (MSI/NSIS).** More polished than a ZIP, but it requires code signing to avoid
SmartScreen warnings and adds real build complexity. A ZIP with two batch files meets the stated
requirement now; an installer can come later.

## Hardened 2026-08-28 — the pipeline had never actually been run

No tag had ever been pushed before this date; the release workflow above existed only as
unexercised code. Running it for the first time (`feat/release-pipeline`) surfaced gaps a real run
would have hit:

- **The tag and the version could disagree.** Nothing checked that the pushed tag matched
  `package.json`. Release now fails fast, before building anything, if `vX.Y.Z` and every
  workspace's `version` are not identical. `npm run version:set -- X.Y.Z` bumps all four
  consistently in one step (`npm version --workspaces --include-workspace-root`).
- **The bundle was never smoke-tested.** The workflow built and published a ZIP without ever
  installing or running it. It now runs `npm ci --omit=dev` and boots the server inside the
  assembled bundle, health-checks it, and fails the release if it does not answer — the same steps
  `install-dependencies.bat` and `startup.bat` perform on the operator's machine. Doing this
  locally, once, before wiring it into CI is what caught the next point:
- **`NODE_ENV=production` is load-bearing, not incidental.** Without it, Fastify's logger reaches
  for the `pino-pretty` transport, which is a devDependency and is correctly absent from the
  `--omit=dev` bundle — so an unset `NODE_ENV` crashes the process on its first log line.
  `startup.bat` already set it; the new smoke-test step now does too, deliberately, with a comment
  explaining why, so nobody "simplifies" it away.
- **`install-dependencies.bat` reinstalled every run, unconditionally.** Fine once, wasteful and
  slow on every later run — including "did anything change after unpacking a new release into the
  same folder?", which is exactly when an operator would run it again. It now stamps
  `node_modules/.install-stamp.txt` with the installed lockfile's SHA-256 and skips straight to
  "already up to date" when nothing changed, using `certutil -hashfile` (built into Windows,
  nothing extra to ship). It also reads its own Node version floor from the bundle's `package.json`
  instead of a number hand-copied into the script.
- **Shipped dependencies were never audited.** `npm audit --omit=dev --audit-level=high` now runs
  against the bundle's own runtime dependencies (not the monorepo's dev tooling) and fails the
  release on a high or critical finding.
- **No changelog existed.** Added `CHANGELOG.md` (Keep a Changelog format), with the convention that
  an entry is written in the same change that makes it, not reconstructed at release time.
- The ZIP's SHA-256 is now computed and attached alongside it, so an operator can verify what they
  downloaded matches what was published.

None of this changes the branching, tagging or bundle-contents decisions above — it is the
difference between a release process that reads correctly and one that has actually been run.

## Revisit when

- The bundle needs to auto-update, or the ZIP becomes unwieldy for operators.
- More than one developer works on the project regularly, which may justify revisiting branch
  strategy.
