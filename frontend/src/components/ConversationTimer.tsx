import { useEffect, useState } from "react";
import { cn } from "../lib/cn";

function elapsedParts(fromIso: string, nowMs: number) {
  const start = Date.parse(fromIso);
  if (!Number.isFinite(start)) {
    return { totalSec: 0, label: "0:00" };
  }
  const totalSec = Math.max(0, Math.floor((nowMs - start) / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(seconds).padStart(2, "0");
  const label = hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
  return { totalSec, label };
}

/** Cronômetro ao vivo desde que a conversa ficou ativa. */
export function ConversationTimer({
  activatedAt,
  className,
}: {
  activatedAt: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { totalSec, label } = elapsedParts(activatedAt, now);
  const tone =
    totalSec >= 15 * 60
      ? "text-red-500"
      : totalSec >= 5 * 60
        ? "text-amber-500"
        : "text-food-text";

  return (
    <span
      className={cn("font-semibold tabular-nums tracking-tight", tone, className)}
      title="Tempo desde que a conversa ficou ativa"
    >
      {label}
    </span>
  );
}
