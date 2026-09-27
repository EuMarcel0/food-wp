import { useEffect, useRef, useState, type RefObject } from "react";

const THRESHOLD = 64;
const MAX_PULL = 110;
const HOLD_AT = 52;
const MIN_SPIN_MS = 600;

/**
 * Gesto “puxar para atualizar” (estilo app nativo) em um container com scroll.
 * Só engata quando o container já está no topo (scrollTop 0).
 */
export function usePullToRefresh(
  ref: RefObject<HTMLElement | null>,
  onRefresh: (() => Promise<unknown>) | undefined,
  enabled = true
) {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !onRefresh) return;

    let startY: number | null = null;
    let engaged = false;

    const setPullValue = (value: number) => {
      pullRef.current = value;
      setPull(value);
    };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1 || el.scrollTop > 0) {
        startY = null;
        return;
      }
      startY = e.touches[0].clientY;
      engaged = false;
    };

    const onMove = (e: TouchEvent) => {
      if (startY === null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || el.scrollTop > 0) {
        if (engaged) {
          engaged = false;
          setDragging(false);
          setPullValue(0);
        }
        if (el.scrollTop > 0) startY = null;
        return;
      }
      if (e.cancelable) e.preventDefault();
      if (!engaged) {
        engaged = true;
        setDragging(true);
      }
      setPullValue(Math.min(MAX_PULL, dy * 0.5));
    };

    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      if (!engaged) return;
      engaged = false;
      setDragging(false);

      if (pullRef.current < THRESHOLD) {
        setPullValue(0);
        return;
      }

      refreshingRef.current = true;
      setRefreshing(true);
      setPullValue(HOLD_AT);
      const started = Date.now();
      void Promise.resolve(onRefreshRef.current?.())
        .catch(() => undefined)
        .then(() => new Promise(resolve => setTimeout(resolve, Math.max(0, MIN_SPIN_MS - (Date.now() - started)))))
        .finally(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          setPullValue(0);
        });
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref, enabled, Boolean(onRefresh)]);

  return {
    pull,
    dragging,
    refreshing,
    progress: Math.min(1, pull / THRESHOLD),
  };
}
