import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * The rendered height of an element, kept current as the layout changes.
 *
 * Sticky offsets need this: an element that sticks below a sticky header has to know how tall that
 * header actually is. Hard-coding the number works until the header wraps on a narrow window, at
 * which point it leaves either a gap or a clipped panel.
 */
export function useElementHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    setHeight(element.getBoundingClientRect().height);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return height;
}
