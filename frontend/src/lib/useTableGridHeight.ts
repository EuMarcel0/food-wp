import { useLayoutEffect, useRef, useState } from "react";

export function useTableGridHeight(enabled: boolean, extraKey?: unknown) {
  const shellRef = useRef<HTMLDivElement>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(400);

  useLayoutEffect(() => {
    if (!enabled) {
      if (shellRef.current) shellRef.current.style.height = "";
      return;
    }

    let cancelled = false;
    let frame = 0;
    let retries = 0;
    let observer: ResizeObserver | null = null;

    const measure = () => {
      if (cancelled) return;
      const shell = shellRef.current;
      const area = tableAreaRef.current;
      if (!shell || !area) return;

      const top = shell.getBoundingClientRect().top;
      const content = document.getElementById("conteudo");
      const padBottom = content
        ? parseFloat(getComputedStyle(content).paddingBottom) || 0
        : 12;
      const shellHeight = Math.floor(window.innerHeight - top - padBottom);
      if (shellHeight <= 0) return;
      shell.style.height = `${shellHeight}px`;
      const header =
        area.querySelector<HTMLElement>(".ant-table-header") ??
        area.querySelector<HTMLElement>(".ant-table-thead");
      const next = Math.floor(
        area.clientHeight - (header?.getBoundingClientRect().height ?? 47) - 2,
      );
      const clamped = Math.max(120, next);
      setBodyHeight((prev) => (Math.abs(prev - clamped) < 1 ? prev : clamped));
    };

    const attach = () => {
      if (cancelled) return;
      const shell = shellRef.current;
      const area = tableAreaRef.current;
      if (!shell || !area) {
        retries += 1;
        if (retries < 32) frame = window.requestAnimationFrame(attach);
        return;
      }

      measure();
      frame = window.requestAnimationFrame(measure);
      observer = new ResizeObserver(measure);
      observer.observe(shell);
      observer.observe(area);
      window.addEventListener("resize", measure);
    };

    attach();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      if (shellRef.current) shellRef.current.style.height = "";
    };
  }, [enabled, extraKey]);

  return { shellRef, tableAreaRef, bodyHeight };
}
