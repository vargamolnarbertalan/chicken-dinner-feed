## What and why

<!-- What changes, and what problem it solves. Link the item in docs/progression.md if there is one. -->

## How to verify

<!-- The steps a reviewer runs to see it working. "It builds" is not verification. -->

## Checklist

- [ ] Title follows [Conventional Commits](https://www.conventionalcommits.org/) (`feat(overlay): …`)
- [ ] Branched from `develop` (or from `main` if this is a `hotfix/*`)
- [ ] `npm run build`, `npm run typecheck` and `npm test` pass locally
- [ ] `docs/progression.md` updated if this changes what is done, next or blocked
- [ ] An ADR added if this makes a decision that is expensive to reverse
- [ ] Nothing secret, and no operator data from `backend/data/`, is committed

## Reviewed against the five axes

<!-- Delete the ones that genuinely do not apply, rather than ticking them all. -->

- [ ] **Correctness** — edge cases, error paths, what happens when PCOB data stops mid-match
- [ ] **Simplification** — no duplication introduced, no abstraction added ahead of need
- [ ] **Efficiency** — no unnecessary re-renders or work in the ~0.5 Hz live path
- [ ] **Safety** — untrusted input validated at the boundary; nothing exposed beyond loopback
- [ ] **Altitude** — solves the actual problem, at the right level
