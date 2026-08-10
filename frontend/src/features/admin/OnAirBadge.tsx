export interface OnAirBadgeProps {
  visible: boolean | undefined;
  size?: 'sm' | 'md';
}

/**
 * Whether an overlay is currently on air.
 *
 * `undefined` — meaning the state has not arrived yet — is shown as its own thing rather than
 * defaulting to "off". Guessing would be worse than admitting we do not know: an operator who reads
 * "OFF" and presses show on an overlay that is already up gets a flicker on air.
 */
export function OnAirBadge({ visible, size = 'md' }: OnAirBadgeProps) {
  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs';

  if (visible === undefined) {
    return (
      <span
        className={`border-border text-muted-foreground rounded border ${padding} font-medium`}
        title="Waiting for the current state"
      >
        …
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded ${padding} font-semibold tracking-wide ${
        visible ? 'bg-[var(--brand-red)] text-white' : 'bg-secondary text-muted-foreground'
      }`}
      title={visible ? 'This overlay is currently showing' : 'This overlay is currently hidden'}
    >
      <span
        className={`size-1.5 rounded-full ${visible ? 'bg-white' : 'bg-muted-foreground'}`}
        aria-hidden
      />
      {visible ? 'ON AIR' : 'HIDDEN'}
    </span>
  );
}
