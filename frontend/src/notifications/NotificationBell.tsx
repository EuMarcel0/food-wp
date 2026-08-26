import { useEffect, useState } from "react";
import { BellOutlined } from "@ant-design/icons";
import { Badge, Button, Drawer, Empty, Popover } from "antd";
import { useNavigate } from "react-router-dom";
import { formatDate } from "../lib/format";
import { useMediaQuery } from "../lib/hooks";
import type { AppNotification } from "../types";
import { useNotifications } from "./NotificationProvider";
import "./notifications.css";

function NotificationList({
  items,
  onSelect,
}: {
  items: AppNotification[];
  onSelect: (id: string) => void;
}) {
  if (!items.length) {
    return (
      <div className="notification-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Nenhuma notificação ainda."
        />
      </div>
    );
  }

  return (
    <ul className="notification-list">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={item.read ? "notification-item is-read" : "notification-item"}
            onClick={() => onSelect(item.id)}
          >
            <span
              className={
                item.type === "order_created"
                  ? "notification-kind is-created"
                  : "notification-kind is-updated"
              }
            >
              {item.type === "order_created" ? "Pedido criado" : "Pedido alterado"}
            </span>
            <strong>{item.title}</strong>
            {item.changeSummary ? (
              <em>{item.changeSummary}</em>
            ) : (
              <em>Novo pedido no WhatsApp</em>
            )}
            <span className="notification-meta">
              {formatDate(item.createdAt)} · {item.actorName}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function NotificationBell() {
  const { items, unread, markRead } = useNotifications();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 991px)");
  const isPhone = useMediaQuery("(max-width: 575px)");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [isMobile]);

  function openOrder(id: string) {
    void markRead(id);
    setOpen(false);
    navigate("/pedidos");
  }

  const unreadLabel = unread
    ? `${unread} não lida${unread === 1 ? "" : "s"}`
    : null;

  const list = <NotificationList items={items} onSelect={openOrder} />;

  const trigger = (
    <Badge count={unread} size="small" offset={[-2, 2]}>
      <Button
        className="notification-bell"
        type="text"
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
          overlayClassName="notification-popover"
          content={
            <div className="notification-panel">
              <div className="notification-panel-head">
                <strong>Notificações</strong>
                {unreadLabel ? <span>{unreadLabel}</span> : null}
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
          extra={
            unreadLabel ? (
              <span className="notification-drawer-count">{unreadLabel}</span>
            ) : null
          }
          placement="right"
          open={open}
          onClose={() => setOpen(false)}
          width={isPhone ? "100%" : 400}
          className="notification-drawer"
          destroyOnClose={false}
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
