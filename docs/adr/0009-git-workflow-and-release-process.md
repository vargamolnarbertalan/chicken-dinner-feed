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
- Bundling `node_modules` makes the ZIP large. Alternative packaging (a single executable via
  `node --experimental-sea-config`, or `pkg`) can be evaluated later; correctness first.

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

## Revisit when

- The bundle needs to auto-update, or the ZIP becomes unwieldy for operators.
- More than one developer works on the project regularly, which may justify revisiting branch
  strategy.
