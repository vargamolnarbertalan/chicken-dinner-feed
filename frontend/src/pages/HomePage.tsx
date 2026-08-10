import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

interface Health {
  status: string;
  version: string;
  protocolVersion: number;
  ingestSource: string;
}

const DEMO_INSTANCE = 'default';

/** Landing page. A signpost while the admin is being built, not a product screen. */
export function HomePage() {
  useDocumentTitle('PUBG overlays');

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
          PUBG Mobile esports broadcast overlay bridge
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

      <section className="border-border rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-medium">Overlay</h2>
        <p className="text-muted-foreground mb-3 text-sm">
          Add this address as a browser source, sized to your canvas:
        </p>
        <code className="bg-muted block rounded px-2 py-1 text-xs">
          {window.location.origin}/overlay/{DEMO_INSTANCE}
        </code>
        <div className="mt-3 flex gap-3 text-sm">
          <Link
            to="/overlay/$instanceId"
            params={{ instanceId: DEMO_INSTANCE }}
            className="underline underline-offset-4"
          >
            Open the overlay
          </Link>
          <a
            href={`/api/overlays/${DEMO_INSTANCE}/toggle`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            Toggle its animation
          </a>
        </div>
      </section>

      <p className="text-muted-foreground text-xs">
        Next: the admin. See <code>docs/progression.md</code>.
      </p>
    </main>
  );
}
