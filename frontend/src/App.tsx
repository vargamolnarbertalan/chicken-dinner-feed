import { PROTOCOL_VERSION } from '@cdf/shared';
import { useEffect, useState } from 'react';

interface Health {
  status: string;
  version: string;
  protocolVersion: number;
  ingestSource: string;
  uptimeSeconds: number;
}

/**
 * Scaffold landing page.
 *
 * This is intentionally a status page, not a product screen: the routing tree, the overlay surfaces
 * and the admin are the next increment. What it does prove is that the whole chain is wired —
 * shared contracts resolve, the app builds, and the backend is reachable through the dev proxy.
 */
export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/health', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Health>;
      })
      .then(setHealth)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 p-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">chicken-dinner-feed</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          PUBG Mobile esports broadcast overlay bridge — scaffold
        </p>
      </header>

      <section className="border-border rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-medium">Backend</h2>
        {health ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{health.status}</dd>
            <dt className="text-muted-foreground">Version</dt>
            <dd>{health.version}</dd>
            <dt className="text-muted-foreground">Protocol</dt>
            <dd>
              v{health.protocolVersion}
              {health.protocolVersion !== PROTOCOL_VERSION && (
                <span className="text-destructive"> (client expects v{PROTOCOL_VERSION})</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Ingest source</dt>
            <dd>{health.ingestSource}</dd>
          </dl>
        ) : error ? (
          <p className="text-destructive text-sm">
            Not reachable: {error}. Start it with <code>npm run dev</code> from the repository root.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">Checking…</p>
        )}
      </section>

      <p className="text-muted-foreground text-xs">
        Next: overlay and admin routes. See <code>docs/progression.md</code>.
      </p>
    </main>
  );
}
