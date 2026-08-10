/** Placeholder. Overlay instances, appearance settings and the scoring ruleset land here next. */
export function AdminPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-3 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="text-muted-foreground text-sm">
        Not built yet. Overlay instances, appearance settings and the scoring ruleset land here
        next.
      </p>
      <p className="text-muted-foreground text-sm">
        Until then, overlays are addressed by any id you choose, and shown or hidden with{' '}
        <code>/api/overlays/&lt;id&gt;/toggle</code>.
      </p>
    </main>
  );
}
