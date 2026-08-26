import { BellOutlined } from "@ant-design/icons";
import { Badge, Button, Empty, Popover } from "antd";
import { useNavigate } from "react-router-dom";
import { formatDate } from "../lib/format";
import { useNotifications } from "./NotificationProvider";
import "./notifications.css";

export function NotificationBell() {
  const { items, unread, markRead } = useNotifications();
  const navigate = useNavigate();

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      arrow={false}
      overlayClassName="notification-popover"
      content={
        <div className="notification-panel">
          <div className="notification-panel-head">
            <strong>Notificações</strong>
            {unread ? <span>{unread} não lida{unread === 1 ? "" : "s"}</span> : null}
          </div>
          {items.length ? (
            <ul className="notification-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={item.read ? "notification-item is-read" : "notification-item"}
                    onClick={() => {
                      void markRead(item.id);
                      navigate("/pedidos");
                    }}
                  >
                    <span
                      className={
                        item.type === "order_created"
                          ? "notification-kind is-created"
                          : "notification-kind is-updated"
                      }
                    >
                      {item.type === "order_created"
                        ? "Pedido criado"
                        : "Pedido alterado"}
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
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhuma notificação ainda." />
          )}
        </div>
      }
    >
      <Badge count={unread} size="small" offset={[-2, 2]}>
        <Button
          className="notification-bell"
          type="text"
          aria-label="Notificações"
          icon={<BellOutlined />}
        />
      </Badge>
    </Popover>
  );
}
