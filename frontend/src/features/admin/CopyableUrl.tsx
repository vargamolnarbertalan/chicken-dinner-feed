import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { toast } from '@/stores/toast-store';

export interface CopyableUrlProps {
  url: string;
  label?: string;
}

const ACTION_CLASS =
  'border-border hover:bg-secondary grid w-9 shrink-0 place-items-center border-l transition-colors';

/**
 * A URL with copy and open actions.
 *
 * The browser-source address is the one thing an operator has to move out of this app and into OBS,
 * and retyping it by hand is both tedious and a good way to end up with a blank source.
 *
 * The actions are icons, so they need names for anyone who cannot infer them from a glyph —
 * `aria-label` for screen readers, `title` so a hover explains them to everyone else.
 */
export function CopyableUrl({ url, label }: CopyableUrlProps) {
  const [justCopied, setJustCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // `navigator.clipboard` needs a secure context. 127.0.0.1 counts as one, so this works in
        // the real deployment — but a bare LAN address, used when Companion runs elsewhere and HOST
        // is opened up, does not.
        const field = document.createElement('textarea');
        field.value = url;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        document.execCommand('copy');
        document.body.removeChild(field);
      }

      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
      toast.success('Address copied', 'Paste it into your broadcast software as a browser source.');
    } catch {
      // Copying can be blocked outright. Say so rather than pretending it worked; the address stays
      // selectable so it can still be copied by hand.
      toast.error(
        'Could not copy the address',
        'Select the text and copy it manually — the browser blocked clipboard access.',
      );
    }
  }

  return (
    <div className="grid gap-1">
      {label && <span className="text-muted-foreground text-xs">{label}</span>}

      <div className="border-border flex items-stretch overflow-hidden rounded border">
        <code className="bg-muted flex-1 truncate px-2 py-1.5 font-mono text-xs" title={url}>
          {url}
        </code>

        <button
          type="button"
          onClick={() => void copy()}
          className={ACTION_CLASS}
          aria-label="Copy the address"
          title="Copy the address"
        >
          {justCopied ? (
            <Check className="size-4 text-emerald-600" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
        </button>

        {/*
         * A real link, not a button that calls window.open — so middle-click and ctrl-click behave
         * the way an operator expects.
         */}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={ACTION_CLASS}
          aria-label="Open the overlay in a new tab"
          title="Open the overlay in a new tab"
        >
          <ExternalLink className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
