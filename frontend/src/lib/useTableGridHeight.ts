import { useLayoutEffect, useRef, useState } from "react";

export function useTableGridHeight(enabled: boolean, extraKey?: unknown) {
  const shellRef = useRef<HTMLDivElement>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(400);

  useLayoutEffect(() => {
    if (!enabled) return;
    const shell = shellRef.current;
    const area = tableAreaRef.current;
    if (!shell || !area) return;

    const measure = () => {
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

    measure();
    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    observer.observe(area);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled, extraKey]);

  return { shellRef, tableAreaRef, bodyHeight };
}
