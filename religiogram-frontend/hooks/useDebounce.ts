import { useEffect, useState } from 'react';

/**
 * Defers a changing value by `delayMs`, returning the most recent value
 * that has been stable for at least that long.
 *
 * Used throughout the search surfaces so we only hit the network once the
 * user has stopped typing for 300 ms. Cuts API load roughly 10× compared
 * to firing on every keystroke, and avoids the flickering "results jump
 * around while you type" effect.
 *
 * The returned value trails the input — callers should key their effects
 * on the debounced value, not the raw one.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
