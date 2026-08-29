import { useState } from 'react';
import type { BackupPreview } from '@cdf/shared';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/stores/toast-store';

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

interface PendingImport {
  file: File;
  preview: BackupPreview;
}

/**
 * Carry every setting from one machine to another as a single ZIP (specs, "Import & Export") — see
 * `backend/src/backup/export.ts` for exactly what travels and what deliberately does not (the
 * running `.env`, and overlay show/hide state, which ADR-0012 already never persists at all).
 *
 * Import is two calls to the same endpoint: the first (on picking a file) only validates and reports
 * what the backup contains, so the confirm dialog below can show the operator something concrete
 * before anything is overwritten; the second, on confirming, re-uploads the same file with
 * `confirm=true` to actually apply it. Nothing is ever half-imported — the backend validates every
 * document and every file reference before writing anything.
 */
export function ImportExport() {
  const [busy, setBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null);

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // So picking the same file again still fires this handler.
    if (!file) return;

    setValidationErrors(null);
    setBusy(true);
    try {
      const preview = await api.previewImport(file);
      setPendingImport({ file, preview });
    } catch (error) {
      const problems =
        error instanceof ApiError ? (error.errors ?? [error.message]) : [describe(error)];
      setValidationErrors(problems);
      toast.error(
        'This backup could not be imported',
        problems.length === 1 ? problems[0] : `${problems.length} problems were found — see below.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    setBusy(true);
    try {
      await api.confirmImport(pendingImport.file);
      setPendingImport(null);
      toast.success(
        'Backup imported',
        'Reloading so every part of the admin reflects it, including the ones not shown here.',
      );
      // A restore touches everything this page and Series control hold in local state — reloading
      // is simpler and more reliable than patching each one by hand, and matches what an operator
      // restoring a backup already expects to happen.
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      const problems =
        error instanceof ApiError ? (error.errors ?? [error.message]) : [describe(error)];
      setValidationErrors(problems);
      toast.error('Could not import the backup', describe(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid max-w-2xl gap-6">
      <ConfirmDialog
        open={pendingImport !== null}
        title="Import this backup?"
        confirmLabel="Import and replace everything"
        destructive
        onCancel={() => setPendingImport(null)}
        onConfirm={() => void confirmImport()}
      >
        {pendingImport && (
          <>
            <p>
              Exported {new Date(pendingImport.preview.manifest.exportedAt).toLocaleString()} from
              app version {pendingImport.preview.manifest.appVersion}. It contains:
            </p>
            <ul className="list-disc pl-5">
              <li>{pendingImport.preview.summary.overlayInstances} overlay(s)</li>
              <li>{pendingImport.preview.summary.teams} team(s)</li>
              <li>{pendingImport.preview.summary.logos} team logo(s)</li>
              <li>{pendingImport.preview.summary.customFonts} custom font(s)</li>
              <li>
                {pendingImport.preview.summary.closedMaps} finished map(s) in the series history
              </li>
            </ul>
            <p className="text-foreground font-medium">
              This replaces your current overlays, teams, scoring, fonts and series history entirely
              — none of it can be recovered afterward unless you have your own backup of it.
            </p>
          </>
        )}
      </ConfirmDialog>

      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Export</h3>
        <p className="text-muted-foreground text-sm">
          Downloads everything below as one ZIP: overlays (appearance, colours, animations), teams
          and their logos, the scoring ruleset, custom fonts, and the series history. Not included:
          this machine's own network settings (
          <code className="font-mono text-xs">backend/.env</code>), and which overlays are currently
          shown on air — neither is meant to travel to another machine.
        </p>
        <a
          href={api.backupExportUrl}
          className="bg-primary text-primary-foreground w-fit rounded px-3 py-1.5 text-sm font-medium"
        >
          Export everything
        </a>
      </section>

      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Import</h3>
        <p className="text-muted-foreground text-sm">
          Pick a backup ZIP exported from another (or this) machine. It is checked first — nothing
          is changed until you confirm what it contains.
        </p>
        <input
          type="file"
          accept=".zip"
          disabled={busy}
          onChange={(event) => void handleFileSelected(event)}
          className="text-sm"
        />

        {validationErrors && (
          <div className="border-destructive/50 bg-destructive/10 grid gap-1 rounded border p-3 text-sm">
            <p className="font-medium">This backup could not be imported:</p>
            <ul className="list-disc pl-5">
              {validationErrors.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
