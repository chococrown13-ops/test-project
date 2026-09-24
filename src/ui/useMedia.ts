import { useEffect, useState } from 'react';

/** Width at which the app switches from the phone layout to the PC one. */
const DESKTOP_QUERY = '(min-width: 1024px)';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && window.matchMedia(query).matches;
}

export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => matches(DESKTOP_QUERY));
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return desktop;
}
