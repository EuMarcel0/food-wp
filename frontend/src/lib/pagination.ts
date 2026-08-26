import type { TablePaginationConfig } from "antd";

export const PAGE_SIZE = 20;

export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export function clampPage(page: number, limit: number, total: number) {
  return Math.min(page, Math.max(1, Math.ceil(total / limit) || 1));
}

export function serverPagination(
  page: number,
  limit: number,
  total: number,
  onChange: (page: number, pageSize: number) => void,
): TablePaginationConfig {
  return {
    current: page,
    pageSize: limit,
    total,
    showSizeChanger: true,
    pageSizeOptions: ["20", "50", "100"],
    showTotal: (count) => (count === 1 ? "1 item" : `${count} itens`),
    onChange,
  };
}
