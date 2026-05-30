/**
 * Tests for hooks/useDebounce.ts
 *
 * Uses React Testing Library's `renderHook` together with Jest fake timers
 * to control the passage of time.
 */

import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('useDebounce()', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── initial value ───────────────────────────────────────────────────────────

  it('returns the initial value immediately on first render', () => {
    const { result } = renderHook(() => useDebounce('hello'));
    expect(result.current).toBe('hello');
  });

  it('returns the initial value for numeric types', () => {
    const { result } = renderHook(() => useDebounce(42));
    expect(result.current).toBe(42);
  });

  it('returns the initial value for object types', () => {
    const obj = { a: 1 };
    const { result } = renderHook(() => useDebounce(obj));
    expect(result.current).toBe(obj);
  });

  // ── debounce delay ──────────────────────────────────────────────────────────

  it('does not update before the default 300 ms delay has elapsed', () => {
    let value = 'initial';
    const { result, rerender } = renderHook(() => useDebounce(value));

    act(() => { value = 'updated'; });
    rerender();

    // Advance only 299 ms — debounced value should still be 'initial'
    act(() => { jest.advanceTimersByTime(299); });
    expect(result.current).toBe('initial');
  });

  it('updates to the new value after the default 300 ms delay', () => {
    let value = 'initial';
    const { result, rerender } = renderHook(() => useDebounce(value));

    act(() => { value = 'updated'; });
    rerender();

    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe('updated');
  });

  it('respects a custom delay (500 ms)', () => {
    let value = 'a';
    const { result, rerender } = renderHook(() => useDebounce(value, 500));

    act(() => { value = 'b'; });
    rerender();

    act(() => { jest.advanceTimersByTime(499); });
    expect(result.current).toBe('a');

    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current).toBe('b');
  });

  // ── rapid updates ───────────────────────────────────────────────────────────

  it('resets the timer on each new input — only the last value lands', () => {
    let value = 'first';
    const { result, rerender } = renderHook(() => useDebounce(value));

    // Three rapid changes
    act(() => { value = 'second'; });
    rerender();
    act(() => { jest.advanceTimersByTime(100); }); // 100ms in

    act(() => { value = 'third'; });
    rerender();
    act(() => { jest.advanceTimersByTime(100); }); // 200ms in

    act(() => { value = 'fourth'; });
    rerender();
    // 300ms after this last change → debounce fires
    act(() => { jest.advanceTimersByTime(300); });

    expect(result.current).toBe('fourth');
  });

  it('does not emit intermediate values during rapid typing', () => {
    const emittedValues: string[] = [];
    let value = 'a';

    const { rerender } = renderHook(() => {
      const dv = useDebounce(value, 300);
      emittedValues.push(dv);
      return dv;
    });

    act(() => { value = 'ab'; });
    rerender();
    act(() => { jest.advanceTimersByTime(100); });

    act(() => { value = 'abc'; });
    rerender();
    act(() => { jest.advanceTimersByTime(300); });

    // The debounced output should only ever be 'a' (initial) and 'abc' (final).
    // 'ab' should never appear.
    expect(emittedValues).not.toContain('ab');
    expect(emittedValues[emittedValues.length - 1]).toBe('abc');
  });

  // ── cleanup ─────────────────────────────────────────────────────────────────

  it('clears the timeout on unmount (no state-update-after-unmount warning)', () => {
    let value = 'initial';
    const { unmount, rerender } = renderHook(() => useDebounce(value));

    act(() => { value = 'updated'; });
    rerender();

    // Unmount before timer fires — if clearTimeout weren't called, React
    // would warn about a setState on an unmounted component.
    unmount();
    act(() => { jest.runAllTimers(); }); // no error expected here
  });
});
