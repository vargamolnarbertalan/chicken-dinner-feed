import type { TeamRosterEntry } from '@cdf/shared';
import { ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast-store';

export interface TeamLogoCellProps {
  team: TeamRosterEntry;
  onChange(team: TeamRosterEntry): void;
}

/**
 * Upload, preview and remove one team's logo.
 *
 * The swatch doubles as the file picker: a 32×32 image with a separate "browse" button beside it
 * would be two controls for one idea. A checkerboard sits behind it because logos are usually
 * transparent PNGs, and against a flat background you cannot tell a white logo from a white
 * background until it is on air.
 */
export function TeamLogoCell({ team, onChange }: TeamLogoCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File): Promise<void> {
    setBusy(true);
    try {
      onChange(await api.uploadTeamLogo(team.teamNo, file));
      toast.success(`Logo set for ${team.name}`, 'It is already showing on air.');
    } catch (error) {
      toast.error(
        `Could not set the logo for ${team.name}`,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
      // Cleared so choosing the same file twice still fires a change event.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(): Promise<void> {
    setBusy(true);
    try {
      onChange(await api.deleteTeamLogo(team.teamNo));
      toast.success(`Logo removed for ${team.name}`);
    } catch (error) {
      toast.error(
        `Could not remove the logo for ${team.name}`,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="border-border hover:border-foreground/40 relative grid size-9 shrink-0 place-items-center overflow-hidden rounded border transition-colors disabled:opacity-50"
        style={{
          backgroundImage:
            'linear-gradient(45deg, #e4e4e7 25%, transparent 25%), linear-gradient(-45deg, #e4e4e7 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e4e4e7 75%), linear-gradient(-45deg, transparent 75%, #e4e4e7 75%)',
          backgroundSize: '8px 8px',
          backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
        }}
        aria-label={
          team.logoUrl ? `Replace the logo for ${team.name}` : `Add a logo for ${team.name}`
        }
        title={team.logoUrl ? `Replace the logo for ${team.name}` : `Add a logo for ${team.name}`}
      >
        {team.logoUrl ? (
          <img src={team.logoUrl} alt="" className="size-full object-contain" />
        ) : (
          <ImagePlus className="text-muted-foreground size-4" aria-hidden />
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <button
        type="button"
        disabled={busy || !team.logoUrl}
        onClick={() => void remove()}
        className="text-muted-foreground hover:text-destructive grid size-5 place-items-center rounded disabled:invisible"
        aria-label={`Remove the logo for ${team.name}`}
        title="Remove the logo"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
