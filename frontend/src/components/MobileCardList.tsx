import type { ReactNode } from "react";
import { Empty, Pagination, Skeleton } from "antd";
import type { TablePaginationConfig } from "antd";
import { entityCard } from "../ui";

export function MobileCardList({
  loading,
  empty,
  isEmpty,
  children,
  pagination,
}: {
  loading: boolean;
  empty?: string;
  isEmpty: boolean;
  children: ReactNode;
  pagination: TablePaginationConfig;
}) {
  return (
    <div className="flex flex-col gap-3">
      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={entityCard}>
              <Skeleton active title paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <Empty description={empty ?? "Nada por aqui."} />
      ) : (
        <div className="grid gap-3">{children}</div>
      )}
      {!loading && (pagination.total ?? 0) > 0 ? (
        <div className="flex justify-center py-2 pb-0.5">
          <Pagination
            current={pagination.current}
            pageSize={pagination.pageSize}
            total={pagination.total}
            showSizeChanger={false}
            simple
            onChange={pagination.onChange}
          />
        </div>
      ) : null}
    </div>
  );
}
