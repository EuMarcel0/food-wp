import { MoreOutlined } from "@ant-design/icons";
import { Button, Dropdown } from "antd";
import type { MenuProps } from "antd";

export function RowActions({ items }: { items: MenuProps["items"] }) {
  const actions = (items ?? []).filter(Boolean);
  if (!actions.length) return null;

  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      menu={{ items: actions }}
    >
      <Button type="text" icon={<MoreOutlined />} />
    </Dropdown>
  );
}
