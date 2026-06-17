import { useState, useEffect } from 'react';

/**
 * useMediaQuery — A hook that listens for media query changes.
 * @param {string} query — The media query to listen for (e.g., '(max-width: 1024px)').
 * @returns {boolean} — Whether the query matches.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia(query);
    
    // Initial check
    if (media.matches !== matches) {
      setMatches(media.matches);
    }

    const listener = (e) => setMatches(e.matches);
    
    // Modern API
    media.addEventListener('change', listener);
    
    return () => media.removeEventListener('change', listener);
  }, [query, matches]);

  return matches;
}
