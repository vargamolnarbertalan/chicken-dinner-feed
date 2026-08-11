import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * The rendered width of an element, kept current as the layout changes.
 *
 * Needed where the value has to reach JavaScript rather than staying in CSS — scaling an iframe by a
 * computed factor, for instance, since `transform: scale()` takes a number and CSS cannot portably
 * divide one length by another.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    setWidth(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return width;
}
