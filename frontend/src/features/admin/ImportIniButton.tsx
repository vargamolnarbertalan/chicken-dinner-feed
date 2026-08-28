import type { TeamRosterDocument } from '@cdf/shared';
import { FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast-store';

export interface ImportIniButtonProps {
  onImported(document: TeamRosterDocument): void;
}

/**
 * Import the operator's existing `TeamLogoAndColor.ini`.
 *
 * Anyone running a PUBG Mobile tournament already maintains this file — the PCOB client reads it to
 * draw team names and logos in-game (specs/PCOB-FINDINGS.md §3). Importing it replaces retyping
 * 16–25 teams by hand, and copies the logos it points at in the same step.
 *
 * It **replaces** the roster rather than merging into it, because the ini is the authoritative team
 * list for the event — merging would leave last tournament's teams sitting in the table. The
 * confirmation says so plainly, since that is not something to discover afterwards.
 */
export function ImportIniButton({ onImported }: ImportIniButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function importFile(file: File): Promise<void> {
    setBusy(true);
    try {
      const result = await api.importTeamIni(file);
      onImported(result.document);

      // Report what did not come across as well as what did: a logo path that no longer resolves is
      // the normal outcome of moving a folder, and silence would leave the operator to notice it on
      // air instead.
      const missing = result.logosMissing.length;
      const truncated = result.namesTruncated.length;
      const copied = `${result.logosCopied} logos copied`;
      const notes = [
        missing > 0 ? `${missing} logo path${missing === 1 ? '' : 's'} could not be found` : null,
        truncated > 0 ? `${truncated} name${truncated === 1 ? '' : 's'} shortened to fit` : null,
      ].filter(Boolean);
      toast.success(
        `Roster replaced with ${result.teams} teams`,
        notes.length === 0 ? `${copied}.` : `${copied}. ${notes.join('; ')}.`,
      );
    } catch (error) {
      toast.error(
        'Could not import that file',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="border-border hover:bg-secondary flex w-fit items-center gap-2 rounded border px-3 py-1.5 text-xs disabled:opacity-50"
        title="Replace the roster with the teams, names and logos from a TeamLogoAndColor.ini"
      >
        <FileUp className="size-3.5" aria-hidden />
        {busy ? 'Importing…' : 'Import TeamLogoAndColor.ini'}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".ini,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
        }}
      />
    </>
  );
}
