import { useEffect } from 'react';

/**
 * Set the browser tab title.
 *
 * It matters more here than on an ordinary page. An operator checking their setup ends up with
 * several overlay tabs open at once, and without distinct titles they are identical — you have to
 * click each one to find out which is which. In broadcast software the title also labels the
 * browser source in some tools.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return;

    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
