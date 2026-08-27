import type { ReactNode, RefObject } from "react";
import { Pagination } from "antd";
import type { TablePaginationConfig } from "antd";
import { cn } from "../lib/cn";
import { tableWrap } from "../ui";

export function FillTable({
  shellRef,
  tableAreaRef,
  pagination,
  children,
}: {
  shellRef: RefObject<HTMLDivElement | null>;
  tableAreaRef: RefObject<HTMLDivElement | null>;
  pagination: TablePaginationConfig;
  children: ReactNode;
}) {
  return (
    <div ref={shellRef} className={cn(tableWrap, "flex min-h-0 flex-1 flex-col")}>
      <div ref={tableAreaRef} className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
      <div className="flex shrink-0 items-center justify-end border-t border-food-border">
        <Pagination {...pagination} />
      </div>
    </div>
  );
}
