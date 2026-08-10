import { useState } from 'react';
import { toast } from '@/stores/toast-store';

export interface CopyableUrlProps {
  url: string;
  label?: string;
}

/**
 * A URL with a copy button.
 *
 * The browser-source address is the one thing an operator has to move out of this app and into OBS,
 * and retyping it by hand is both tedious and a good way to end up with a blank source.
 *
 * `navigator.clipboard` needs a secure context. `127.0.0.1` counts as one, so this works in the real
 * deployment — but the fallback stays because a bare LAN address (when Companion runs elsewhere and
 * HOST is opened up) does not.
 */
export function CopyableUrl({ url, label }: CopyableUrlProps) {
  const [justCopied, setJustCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
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
      toast.success('Address copied — paste it into your browser source.');
    } catch {
      // Copying can be blocked outright. Say so rather than pretending it worked, and leave the
      // text selectable so it can still be copied by hand.
      toast.error('Could not copy automatically — select the address and copy it manually.');
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
          className="border-border hover:bg-secondary border-l px-3 text-xs whitespace-nowrap"
        >
          {justCopied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
