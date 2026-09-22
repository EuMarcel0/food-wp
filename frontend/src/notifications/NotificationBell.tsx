import { useEffect, useRef, useState } from "react";
import { BellOutlined } from "@ant-design/icons";
import { Badge, Button, Drawer, Empty, Popover, Spin } from "antd";
import { useNavigate } from "react-router-dom";
import { formatDate } from "../lib/format";
import { useMediaQuery } from "../lib/hooks";
import { cn } from "../lib/cn";
import type { AppNotification } from "../types";
import { useNotifications } from "./NotificationProvider";

function NotificationList({
  items,
  hasMore,
  loadingMore,
  onLoadMore,
  onSelect,
}: {
  items: AppNotification[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLUListElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!hasMore || loadingMore) return;
    const root = scrollRef.current;
    const el = sentinelRef.current;
    if (!root || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      { root, rootMargin: "80px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, items.length]);

  if (!items.length) {
    return (
      <div className="px-4 py-10 pb-8">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Nenhuma notificação ainda."
        />
      </div>
    );
  }

  return (
    <ul
      ref={scrollRef}
      className="m-0 max-h-[380px] list-none overflow-auto overscroll-contain p-1.5 max-lg:max-h-none max-lg:flex-1 max-lg:p-2"
    >
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={cn(
              "flex w-full cursor-pointer flex-col items-start gap-1 rounded-xl border-0 bg-transparent px-3 py-2.5 text-left text-inherit hover:bg-food-chip",
              item.read && "opacity-[0.58]",
            )}
            onClick={() => onSelect(item.id)}
          >
            <span
              className={cn(
                "text-[10px] font-extrabold uppercase tracking-wider",
                item.type === "order_created" ? "text-green-500" : "text-food-accent",
              )}
            >
              {item.type === "order_created" ? "Pedido criado" : "Pedido alterado"}
            </span>
            <strong className="text-[13px] tracking-tight">{item.title}</strong>
            <em className="not-italic text-[13px] text-food-text">
              {item.changeSummary || "Novo pedido no WhatsApp"}
            </em>
            <span className="text-xs text-food-muted">
              {formatDate(item.createdAt)} · {item.actorName}
            </span>
          </button>
        </li>
      ))}
      {hasMore ? (
        <li>
          <div
            ref={sentinelRef}
            className="flex h-10 items-center justify-center"
          >
            {loadingMore ? <Spin size="small" /> : null}
          </div>
        </li>
      ) : null}
    </ul>
  );
}

export function NotificationBell() {
  const {
    items,
    unread,
    hasMore,
    loadingMore,
    loadMore,
    markRead,
    markAllRead,
  } = useNotifications();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 991px)");
  const isPhone = useMediaQuery("(max-width: 575px)");
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [isMobile]);

  function openOrder(id: string) {
    void markRead(id);
    setOpen(false);
    navigate("/pedidos");
  }

  async function handleMarkAllRead() {
    if (!unread || markingAll) return;
    setMarkingAll(true);
    try {
      await markAllRead();
    } finally {
      setMarkingAll(false);
    }
  }

  const markAllButton =
    unread > 0 ? (
      <Button
        type="text"
        size="small"
        loading={markingAll}
        onClick={() => void handleMarkAllRead()}
        className="!h-auto !px-0 !text-xs font-semibold text-food-accent"
      >
        Marcar todas como lida
      </Button>
    ) : null;

  const list = (
    <NotificationList
      items={items}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={() => {
        void loadMore();
      }}
      onSelect={openOrder}
    />
  );

  const trigger = (
    <Badge dot={unread > 0} offset={[-2, 2]} color="#ef4444">
      <Button
        className="!size-8"
        type="text"
        size="small"
        aria-label="Notificações"
        aria-expanded={open}
        aria-haspopup="dialog"
        icon={<BellOutlined />}
        onClick={isMobile ? () => setOpen(true) : undefined}
      />
    </Badge>
  );

  return (
    <>
      {isMobile ? (
        trigger
      ) : (
        <Popover
          trigger="click"
          placement="bottomRight"
          arrow={false}
          open={open}
          onOpenChange={setOpen}
          overlayClassName="[&_.ant-popover-inner]:overflow-hidden [&_.ant-popover-inner]:rounded-2xl [&_.ant-popover-inner]:p-0"
          content={
            <div className="w-[min(360px,calc(100vw-24px))]">
              <div className="flex items-center justify-between gap-3 border-b border-food-border px-4 pt-3.5 pb-2.5">
                <strong className="text-sm tracking-tight">Notificações</strong>
                {markAllButton}
              </div>
              {list}
            </div>
          }
        >
          {trigger}
        </Popover>
      )}
      {isMobile ? (
        <Drawer
          title="Notificações"
          extra={markAllButton}
          placement="right"
          open={open}
          onClose={() => setOpen(false)}
          width={isPhone ? "100%" : 400}
          className="[&_.ant-drawer-header]:border-food-border [&_.ant-drawer-body]:min-h-0 [&_.ant-drawer-body]:pb-[env(safe-area-inset-bottom)]"
          destroyOnHidden={false}
          styles={{
            body: { padding: 0, display: "flex", flexDirection: "column" },
          }}
        >
          {list}
        </Drawer>
      ) : null}
    </>
  );
}
