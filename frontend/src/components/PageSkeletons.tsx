import { Skeleton } from "antd";

export function HeaderSkeleton() {
  return (
    <div className="mb-5 max-w-xl">
      <Skeleton active title={{ width: 88, style: { marginBottom: 8, height: 12 } }} paragraph={false} />
      <Skeleton active title={{ width: 240 }} paragraph={{ rows: 1, width: ["80%"] }} />
    </div>
  );
}

export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
      {Array.from({ length: 3 }, (_, index) => (
        <article
          key={index}
          className="rounded-2xl border border-food-border bg-food-surface px-[18px] pt-[18px] pb-5 shadow-food-soft"
        >
          <Skeleton active title={{ width: "45%" }} paragraph={false} />
          <Skeleton.Button active className="mt-3 !h-9 !w-28" />
        </article>
      ))}
    </div>
  );
}

