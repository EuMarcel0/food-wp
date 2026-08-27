import { MoreOutlined } from "@ant-design/icons";
import { Button, Dropdown } from "antd";
import type { MenuProps } from "antd";

export function RowActions({
  items,
  disabled,
}: {
  items: MenuProps["items"];
  disabled?: boolean;
}) {
  const actions = (items ?? []).filter(Boolean);
  if (!actions.length && !disabled) return null;

  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      menu={{ items: actions }}
      disabled={disabled || !actions.length}
    >
      <Button
        type="text"
        icon={<MoreOutlined />}
        aria-label="Ações da linha"
        disabled={disabled || !actions.length}
      />
    </Dropdown>
  );
}
