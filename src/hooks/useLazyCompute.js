// K9 Operations — Lazy Computation Hook
// Defers metric computation until the section is visible in viewport.
// Uses IntersectionObserver to detect visibility.

import { useState, useEffect, useRef, useMemo } from "react";

/**
 * useLazyCompute — defers computation until element is visible.
 * Returns { ref, value, isVisible }.
 * - Attach `ref` to the container element.
 * - `value` is null until visible, then the result of `computeFn()`.
 * - `computeFn` is only called once the element enters the viewport.
 */
export function useLazyCompute(computeFn, deps) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => isVisible ? computeFn() : null, [isVisible, ...deps]);

  return { ref, value, isVisible };
}

/**
 * useSectionVisibility — tracks whether a section is visible.
 * Returns { ref, isVisible }.
 */
export function useSectionVisibility() {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}
