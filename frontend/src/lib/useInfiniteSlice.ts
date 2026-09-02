import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const INFINITE_SLICE_SIZE = 20;

export function useInfiniteSlice<T>(
  items: T[],
  pageSize = INFINITE_SLICE_SIZE,
  itemKey?: (item: T) => string,
) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingLock = useRef(false);

  const itemsKey = useMemo(
    () => (itemKey ? items.map(itemKey).join("|") : String(items.length)),
    [itemKey, items],
  );

  useEffect(() => {
    setVisibleCount(pageSize);
    setLoadingMore(false);
    loadingLock.current = false;
  }, [itemsKey, pageSize]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount],
  );
  const hasMore = visibleCount < items.length;

  const loadMore = useCallback(() => {
    if (!hasMore || loadingLock.current) return;
    loadingLock.current = true;
    setLoadingMore(true);
    window.setTimeout(() => {
      setVisibleCount((current) => Math.min(current + pageSize, items.length));
      setLoadingMore(false);
      loadingLock.current = false;
    }, 200);
  }, [hasMore, items.length, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin: "160px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore, visibleCount]);

  return { visibleItems, hasMore, loadingMore, loadMore, sentinelRef };
}
