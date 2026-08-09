# chicken-dinner-feed

Real-time bridge between the **PUBG Mobile PCOB API** and broadcast software. It ingests live match
telemetry, applies a configurable tournament scoring ruleset, and renders animated overlays that a
broadcast tool can consume as browser sources.

> **Status: scaffold.** Architecture is decided and the toolchain is wired end to end. Overlay
> rendering, the admin UI and PCOB ingestion are not implemented yet — see
> [`docs/progression.md`](docs/progression.md).

---

## What it is

|             |                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------- |
| **Input**   | The PCOB client's local API on the observer PC — pushes match state roughly every 2 seconds    |
| **Output**  | Browser-source overlay pages (leaderboard with live health bars, points, eliminations)         |
| **Control** | A local admin UI for colours, fonts, sizes, placement, show/hide animations, and live previews |
| **Runs on** | The operator's Windows machine, entirely on localhost. No cloud, no database                   |

The key constraint driving the design: **the PCOB API is a local Windows process**, not a remote
service — see [`specs/PCOB-FINDINGS.md`](specs/PCOB-FINDINGS.md) and
[ADR-0001](docs/adr/0001-local-windows-bundle-over-cloud-stack.md).

## For operators

You want the packaged release, not this repository. Download the ZIP from the
[releases page](../../releases), unpack it, then:

1. Run **`install-dependencies.bat`** once (needs internet).
2. Run **`startup.bat`** before each broadcast. Leave the window open while on air.

Full instructions: **[English](docs/user/user-guide.en.md)** · **[Magyar](docs/user/user-guide.hu.md)**

## For developers

### Prerequisites

- Node.js **22 or newer** (`.nvmrc` pins 22.19.0). npm ships with it; nothing else is required.

### Getting started

```bash
git clone <repo-url>
cd chicken-dinner-feed
npm install          # installs all three workspaces
npm run dev          # shared (watch) + backend (4317) + frontend (4318)
```

Open <http://127.0.0.1:4318>. The Vite dev server proxies `/api` and `/ws` to the backend, so the
app always talks to a same-origin API in both development and production.

| Command             | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | All three workspaces in watch mode                           |
| `npm run build`     | Builds shared → backend → frontend, in that order            |
| `npm start`         | Runs the built backend, which also serves the built frontend |
| `npm run typecheck` | Type-checks every workspace                                  |
| `npm run lint`      | Lints every workspace                                        |
| `npm test`          | Runs every workspace's tests                                 |
| `npm run format`    | Prettier over the repository                                 |

### Layout

```
chicken-dinner-feed/
├─ specs/                  Source material and findings
│  ├─ APP-PLAN.md            The original product plan
│  ├─ PCOB-FINDINGS.md       What the PCOB guideline means for us — read this first
│  └─ example.png            Target look for the leaderboard overlay
├─ docs/
│  ├─ adr/                   Architecture Decision Records
│  ├─ progression.md         What is done, what is next, what is blocked
│  └─ user/                  Operator documentation (EN + HU)
├─ shared/                 @cdf/shared — Zod contracts, the single source of truth
├─ backend/               @cdf/backend — Fastify: ingestion, state, API, static hosting
│  ├─ src/
│  ├─ data/                  Persisted config (git-ignored, operator-owned)
│  └─ .env.example
├─ frontend/              @cdf/frontend — React: overlay surfaces + admin
│  ├─ src/
│  └─ public/{images,fonts}
├─ install-dependencies.bat
└─ startup.bat
```

### How the pieces fit

```
PCOB client (local Windows process)
        │  ~0.5 Hz, pushes on change
        ▼
 ingestion adapter  ──────────────► normalised domain model  (never raw PCOB payloads)
 (mock | pcob)                              │
                                            ▼
                                    live state + scoring
                                            │  full snapshots, only on real change
                                            ▼
                              WebSocket ──► overlay browser sources
                                        └─► admin live preview
```

Each arrow has an ADR behind it: ingestion boundary
([0006](docs/adr/0006-pcob-ingestion-adapter-boundary.md)), snapshot fan-out
([0007](docs/adr/0007-websocket-state-fanout.md)), admin as a route
([0008](docs/adr/0008-admin-as-protected-frontend-route.md)).

### API reference

With the backend running, the generated OpenAPI document is at
<http://127.0.0.1:4317/api/docs>. It is derived from the same Zod schemas used for runtime
validation, so it cannot drift from the implementation.

## Architecture decisions

All decisions and their trade-offs are recorded in [`docs/adr/`](docs/adr/README.md). The short
version:

| Decision                                                                                 | Why                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Local Windows bundle](docs/adr/0001-local-windows-bundle-over-cloud-stack.md)           | The PCOB API only exists on the observer PC's localhost                              |
| [Node + TypeScript + Fastify](docs/adr/0002-node-typescript-fastify-backend.md)          | One language, fast cold start, first-class WebSockets, OpenAPI from schemas          |
| [React + Vite + Tailwind + shadcn](docs/adr/0003-react-vite-tailwind-shadcn-frontend.md) | As planned; Motion for reorder/enter/exit animation                                  |
| [JSON files, no database](docs/adr/0004-json-file-persistence.md)                        | Only small config documents; operators can copy and back them up                     |
| [Workspaces + shared contracts](docs/adr/0005-monorepo-with-shared-contracts.md)         | One Zod definition behind validation, OpenAPI, persistence and the client            |
| [Ingestion adapter](docs/adr/0006-pcob-ingestion-adapter-boundary.md)                    | The PCOB schema is undocumented to us and changes on someone else's release schedule |
| [WebSocket snapshots](docs/adr/0007-websocket-state-fanout.md)                           | Browser sources reload mid-match and must be correct instantly                       |
| [Admin as a route](docs/adr/0008-admin-as-protected-frontend-route.md)                   | The preview must be the real overlay, not a lookalike                                |
| [feat → develop → main](docs/adr/0009-git-workflow-and-release-process.md)               | As planned; releases are deliberate, tagged, and shipped as a bundle ZIP             |

## Known blocker

The authoritative **PCOB API schema document is access-restricted** (HTTP 401). Until it is
available we do not know the transport, port, message envelope or field names, so `INGEST_SOURCE`
defaults to `mock`. Details and the full list of open questions:
[`specs/PCOB-FINDINGS.md`](specs/PCOB-FINDINGS.md#open-questions).

## Contributing

Branch from `develop` as `feat/*`, `fix/*`, `chore/*` or `docs/*`; merge back by pull request using
[Conventional Commits](https://www.conventionalcommits.org/). See
[ADR-0009](docs/adr/0009-git-workflow-and-release-process.md).
