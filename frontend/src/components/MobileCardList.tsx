import type { ReactNode } from "react";
import { Empty, Pagination, Skeleton } from "antd";
import type { TablePaginationConfig } from "antd";
import "./mobile-cards.css";

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
    <div className="mobile-card-list">
      {loading ? (
        <div className="mobile-card-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="entity-card">
              <Skeleton active title paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <Empty description={empty ?? "Nada por aqui."} />
      ) : (
        <div className="mobile-card-grid">{children}</div>
      )}
      {!loading && (pagination.total ?? 0) > 0 ? (
        <div className="mobile-card-pager">
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
