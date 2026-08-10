import type { CustomFont } from '@cdf/shared';
import { fontFamilyValue } from '@cdf/shared';
import { Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { applyCustomFontFaces } from '@/lib/font-faces';
import { toast } from '@/stores/toast-store';

export interface FontManagerProps {
  fonts: CustomFont[];
  onChange(fonts: CustomFont[]): void;
}

/** Shows what the font actually looks like in the shapes the overlay uses most. */
const SAMPLE = 'MGLZ 16 · Alive 4 · PTS 128';

/**
 * Upload and manage the operator's own fonts.
 *
 * A tournament's typeface is rarely one of the few we could reasonably ship, and a brand's font
 * arrives as a desktop `.ttf` or `.otf` rather than as a web font — so both are accepted.
 *
 * Each entry is previewed **in its own font**, because a family name tells an operator nothing about
 * whether the digits are legible at overlay size, which is the only thing that matters here.
 */
export function FontManager({ fonts, onChange }: FontManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File): Promise<void> {
    setBusy(true);
    try {
      const font = await api.uploadFont(file);
      const next = [...fonts.filter((entry) => entry.family !== font.family), font];
      // Registered immediately so the sample below renders in the new font rather than a fallback.
      applyCustomFontFaces(next);
      onChange(next);
      toast.success(`Added “${font.family}”`, 'Pick it in the Font list of any overlay.');
    } catch (error) {
      toast.error(
        'Could not add that font',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(font: CustomFont): Promise<void> {
    setBusy(true);
    try {
      const document = await api.deleteFont(font.family);
      applyCustomFontFaces(document.fonts);
      onChange(document.fonts);
      toast.success(
        `Removed “${font.family}”`,
        'Overlays still set to it fall back to the system font until you pick another.',
      );
    } catch (error) {
      toast.error(
        'Could not remove that font',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <h3 className="text-sm font-medium">Your fonts</h3>
        <p className="text-muted-foreground text-xs">
          TTF, OTF, WOFF or WOFF2, up to 8 MB. Once added, a font appears in the Font list of every
          overlay.
        </p>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="border-border hover:bg-secondary flex w-fit items-center gap-2 rounded border px-3 py-1.5 text-xs disabled:opacity-50"
      >
        <Upload className="size-3.5" aria-hidden />
        {busy ? 'Working…' : 'Upload a font'}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {fonts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No fonts uploaded yet — the built-in choices are still available.
        </p>
      ) : (
        <ul className="grid gap-2">
          {fonts.map((font) => (
            <li
              key={font.family}
              className="border-border flex items-center gap-3 rounded border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-lg leading-tight"
                  style={{ fontFamily: fontFamilyValue(font.family) }}
                >
                  {SAMPLE}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {font.family} · {font.originalName}
                </p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(font)}
                className="text-destructive hover:bg-destructive/10 grid size-8 shrink-0 place-items-center rounded disabled:opacity-50"
                aria-label={`Remove ${font.family}`}
                title={`Remove ${font.family}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
