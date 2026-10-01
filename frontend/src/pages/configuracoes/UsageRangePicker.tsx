import { DatePicker } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import type { UsageRangeParams } from "../../lib/api";

type Range = [Dayjs, Dayjs];

const MAX_DAYS = 93;

function currentMonth(): Range {
  return [dayjs().startOf("month"), dayjs()];
}

/** Período do relatório de consumo; padrão: mês atual. */
export function useUsageRange() {
  const [range, setRange] = useState<Range>(currentMonth);
  const params = useMemo<UsageRangeParams>(
    () => ({ from: range[0].format("YYYY-MM-DD"), to: range[1].format("YYYY-MM-DD") }),
    [range]
  );
  const includesToday = !range[1].isBefore(dayjs(), "day");
  return { range, setRange, params, key: `${params.from}_${params.to}`, includesToday };
}

/** Nome do mês anterior (ex.: "setembro"). */
export function previousMonthLabel() {
  return dayjs().subtract(1, "month").toDate().toLocaleDateString("pt-BR", { month: "long" });
}

export function UsageRangePicker({ value, onChange }: { value: Range; onChange: (range: Range) => void }) {
  const today = dayjs();
  return (
    <DatePicker.RangePicker
      size='small'
      allowClear={false}
      format='DD/MM/YYYY'
      value={value}
      className='w-full sm:w-auto'
      disabledDate={(day, info) => {
        if (day.isAfter(today, "day")) return true;
        const from = info?.from;
        return Boolean(from && Math.abs(day.diff(from, "day")) >= MAX_DAYS);
      }}
      presets={[
        { label: "Hoje", value: [today.startOf("day"), today] },
        { label: "Últimos 7 dias", value: [today.subtract(6, "day"), today] },
        { label: "Últimos 30 dias", value: [today.subtract(29, "day"), today] },
        { label: "Este mês", value: currentMonth() },
        {
          label: "Mês anterior",
          value: [today.subtract(1, "month").startOf("month"), today.subtract(1, "month").endOf("month")]
        }
      ]}
      onChange={next => {
        if (next?.[0] && next[1]) onChange([next[0], next[1]]);
      }}
    />
  );
}
