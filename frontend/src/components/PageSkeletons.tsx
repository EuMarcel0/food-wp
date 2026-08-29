import type { ReactNode } from "react";
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

function SettingsCardSkeleton({
  children,
  titleWidth = 180,
}: {
  children: ReactNode;
  titleWidth?: number | string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft">
      <div className="border-b border-food-border px-6 py-4">
        <Skeleton
          active
          title={{ width: titleWidth, style: { margin: 0, height: 18 } }}
          paragraph={false}
        />
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

export function SettingsSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando configurações">
        <SettingsCardSkeleton titleWidth={220}>
          <div className="mb-4 flex items-center gap-3">
            <Skeleton.Avatar active size={72} shape="circle" />
            <div className="min-w-0 flex-1">
              <Skeleton.Button active className="!h-8 !w-28" />
              <Skeleton
                active
                className="mt-2"
                title={false}
                paragraph={{ rows: 1, width: "55%" }}
              />
            </div>
          </div>
          <Skeleton.Input active className="!mb-4 !h-9 !w-full !max-w-md" />
          <Skeleton
            active
            className="mb-3 max-w-2xl"
            title={{ width: 200 }}
            paragraph={{ rows: 1, width: "70%" }}
          />
          <div className="max-w-2xl overflow-hidden rounded-2xl border border-food-border">
            {Array.from({ length: 7 }, (_, index) => (
              <div
                key={index}
                className="grid items-center gap-3 border-b border-food-border px-3.5 py-3 last:border-b-0 sm:grid-cols-[7.5rem_5.5rem_minmax(0,1fr)]"
              >
                <Skeleton.Input active size="small" className="!h-4 !w-20 !min-w-0" />
                <Skeleton.Button active size="small" className="!h-6 !w-16" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton.Input active size="small" className="!h-8 !w-[108px] !min-w-0" />
                  <Skeleton.Input active size="small" className="!h-8 !w-[108px] !min-w-0" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton.Button active className="mt-4 !h-9 !w-28" />
        </SettingsCardSkeleton>

        <SettingsCardSkeleton titleWidth={160}>
          <div className="max-w-xl space-y-3">
            <Skeleton active title={false} paragraph={{ rows: 2, width: ["95%", "70%"] }} />
            <Skeleton.Input active className="!h-9 !w-full" />
            <Skeleton.Input active className="!h-9 !w-full" />
            <Skeleton.Input active className="!h-20 !w-full" />
            <Skeleton.Button active className="!h-9 !w-32" />
          </div>
        </SettingsCardSkeleton>

        <SettingsCardSkeleton titleWidth={140}>
          <div className="max-w-xl space-y-3">
            <Skeleton active title={false} paragraph={{ rows: 1, width: "80%" }} />
            <Skeleton.Input active className="!h-9 !w-full !max-w-sm" />
            <Skeleton.Button active className="!h-8 !w-24" />
          </div>
        </SettingsCardSkeleton>

        <SettingsCardSkeleton titleWidth={170}>
          <div className="max-w-xl space-y-3">
            <Skeleton active title={false} paragraph={{ rows: 2, width: ["90%", "60%"] }} />
            <div className="flex flex-wrap items-end gap-4">
              <Skeleton.Input active className="!h-9 !w-52" />
              <Skeleton.Button active className="!h-8 !w-20" />
            </div>
            <Skeleton.Button active className="!h-9 !w-24" />
          </div>
        </SettingsCardSkeleton>

        <SettingsCardSkeleton titleWidth={120}>
          <div className="flex flex-wrap gap-2">
            <Skeleton.Button active className="!h-7 !w-24 !rounded-full" />
            <Skeleton.Button active className="!h-7 !w-28 !rounded-full" />
            <Skeleton.Button active className="!h-7 !w-28 !rounded-full" />
          </div>
        </SettingsCardSkeleton>

        <SettingsCardSkeleton titleWidth={190}>
          <div className="max-w-xl space-y-3">
            <Skeleton active title={false} paragraph={{ rows: 2, width: ["85%", "55%"] }} />
            <Skeleton.Input active className="!h-9 !w-full" />
            <Skeleton.Button active className="!h-9 !w-28" />
            <div className="mt-2 space-y-2">
              {Array.from({ length: 2 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 rounded-xl border border-food-border px-3 py-3"
                >
                  <Skeleton.Input active size="small" className="!h-4 !w-36 !min-w-0" />
                  <Skeleton.Button active size="small" className="!h-7 !w-16" />
                </div>
              ))}
            </div>
          </div>
        </SettingsCardSkeleton>
      </div>
    </>
  );
}

