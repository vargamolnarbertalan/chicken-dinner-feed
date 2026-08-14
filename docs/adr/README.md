# Architecture Decision Records

Every decision that is expensive to reverse gets a numbered record here. A record is written
**when the decision is made**, not afterwards, and it is never edited once accepted — if the
decision changes, write a new ADR and mark the old one `Superseded by ADR-XXXX`.

## Index

| #                                                        | Title                                                        | Status   |
| -------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| [0001](0001-local-windows-bundle-over-cloud-stack.md)    | Ship as a local Windows bundle, not a cloud Docker stack     | Accepted |
| [0002](0002-node-typescript-fastify-backend.md)          | Node.js + TypeScript + Fastify for the backend               | Accepted |
| [0003](0003-react-vite-tailwind-shadcn-frontend.md)      | React + Vite + Tailwind + shadcn/ui for the frontend         | Accepted |
| [0004](0004-json-file-persistence.md)                    | JSON files on disk for persistence, no database              | Accepted |
| [0005](0005-monorepo-with-shared-contracts.md)           | npm-workspaces monorepo with a shared contracts package      | Accepted |
| [0006](0006-pcob-ingestion-adapter-boundary.md)          | Isolate the PCOB API behind an ingestion adapter             | Accepted |
| [0007](0007-websocket-state-fanout.md)                   | Push state to overlays over WebSocket as versioned snapshots | Accepted |
| [0008](0008-admin-as-protected-frontend-route.md)        | Admin is a route in the frontend app, not a separate app     | Accepted |
| [0009](0009-git-workflow-and-release-process.md)         | feat → develop → main with tagged bundle releases            | Accepted |
| [0010](0010-poll-the-pcob-http-api.md)                   | Poll the PCOB HTTP API on `127.0.0.1:10086`                  | Accepted |
| [0011](0011-resolution-independent-overlay-scaling.md)   | Scale overlays from a fixed design canvas                    | Accepted |
| [0012](0012-http-overlay-control-for-stream-decks.md)    | Overlay visibility is server state, driven by plain HTTP     | Accepted |
| [0013](0013-preview-embeds-the-real-overlay.md)          | The admin preview embeds the real overlay page               | Accepted |
| [0014](0014-feedback-document-as-a-stable-projection.md) | `/feedback` is a stable projection, not a config view        | Accepted |

## Writing a new one

Copy [`_template.md`](_template.md), take the next free number, add a row to the table above.

Statuses: `Proposed` · `Accepted` · `Deprecated` · `Superseded by ADR-XXXX`.
