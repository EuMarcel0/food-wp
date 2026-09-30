import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  DatePicker,
  Empty,
  Modal,
  Pagination,
  Radio,
  Select,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { ListFilters } from "../../../components/ListFilters";
import { PageHeader } from "../../../components/PageHeader";
import { api } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { useMediaQuery } from "../../../lib/hooks";
import {
  formatBRL,
  formatDate,
  PAYMENT_LABEL,
} from "../../../lib/format";
import { printSalesByPaymentReportViaAgent } from "../../../lib/printAgent";
import { queryKeys } from "../../../lib/queryKeys";
import { toast } from "../../../lib/toast";
import type { Order, SalesByPaymentReport } from "../../../types";
import { listPage, tableClass } from "../../../ui";

const isMixed = (method: string | null | undefined) => method === "mixed";

const MIXED_ROW = "[&>td]:!bg-violet-500/8";

function PaymentTag({ label, method }: { label: string; method: string | null | undefined }) {
  if (!isMixed(method)) return <Tag color="blue">{label}</Tag>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Tag color="purple" className="!me-0 !font-semibold">
        {label}
      </Tag>
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-violet-500">
        Misto
      </span>
    </span>
  );
}

const MOBILE_PAGE_SIZE = 20;
const LOCKED_VIEWPORT =
  "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

/**
 * O manifest do PWA não controla zoom: trava o viewport só enquanto esta tela está aberta
 * (evita o zoom automático/“encolher” em alguns aparelhos) e restaura ao sair.
 */
function useLockedViewport() {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const previous = meta.getAttribute("content");
    meta.setAttribute("content", LOCKED_VIEWPORT);
    return () => {
      if (previous) meta.setAttribute("content", previous);
    };
  }, []);
}

type ReportOrder = SalesByPaymentReport["orders"][number];

function MobileSummaryList({
  rows,
  loading,
}: {
  rows: SalesByPaymentReport["summary"];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spin />
      </div>
    );
  }
  if (!rows.length) {
    return <Empty description="Sem vendas no período." image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-food-border overflow-hidden rounded-xl border border-food-border bg-food-surface p-0">
      {rows.map((row) => (
        <li
          key={`${row.paymentMethod ?? "none"}-${row.paymentMethodLabel}`}
          className={cn(
            "flex items-center justify-between gap-3 px-3.5 py-3",
            isMixed(row.paymentMethod) && "bg-violet-500/8",
          )}
        >
          <div className="min-w-0">
            <PaymentTag label={row.paymentMethodLabel} method={row.paymentMethod} />
            <p className="m-0 mt-1 text-xs text-food-muted">
              {row.orderCount} {row.orderCount === 1 ? "pedido" : "pedidos"}
            </p>
          </div>
          <strong className="shrink-0 tabular-nums text-food-text">{formatBRL(row.totalCents)}</strong>
        </li>
      ))}
    </ul>
  );
}

function MobileOrdersList({ rows, loading }: { rows: ReportOrder[]; loading: boolean }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rows]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spin />
      </div>
    );
  }
  if (!rows.length) {
    return <Empty description="Nenhum pedido neste período." image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }
  const visible = rows.slice((page - 1) * MOBILE_PAGE_SIZE, page * MOBILE_PAGE_SIZE);
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {visible.map((row) => (
          <li
            key={row.id}
            className={cn(
              "rounded-xl border border-food-border bg-food-surface px-3.5 py-3",
              isMixed(row.paymentMethod) && "border-violet-500/30 bg-violet-500/8",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <strong className="text-sm text-food-text">#{row.code}</strong>
              <strong className="shrink-0 tabular-nums text-food-text">{formatBRL(row.totalCents)}</strong>
            </div>
            <p className="m-0 mt-0.5 truncate text-sm text-food-text">{row.customerName || "—"}</p>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-food-muted">{formatDate(row.createdAt)}</span>
              {isMixed(row.paymentMethod) ? (
                <PaymentTag label={row.displayPaymentLabel} method={row.paymentMethod} />
              ) : (
                <span className="text-xs font-medium text-food-muted">{row.displayPaymentLabel}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {rows.length > MOBILE_PAGE_SIZE ? (
        <div className="mt-3 flex justify-center">
          <Pagination
            simple
            current={page}
            pageSize={MOBILE_PAGE_SIZE}
            total={rows.length}
            onChange={setPage}
          />
        </div>
      ) : null}
    </>
  );
}

function todayRange(): [Dayjs, Dayjs] {
  const today = dayjs().startOf("day");
  return [today, today];
}

function formatDayBr(day?: string | null) {
  if (!day) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split("-");
    return `${d}/${m}/${y}`;
  }
  return formatDate(day);
}

function escapeHtml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openSalesReportPdfA4(input: {
  storeName: string;
  fromDay?: string;
  toDay?: string;
  paymentFilterLabel: string;
  report: SalesByPaymentReport;
}) {
  const { storeName, fromDay, toDay, paymentFilterLabel, report } = input;
  const summaryRows = report.summary
    .map(
      (row) =>
        `<tr${isMixed(row.paymentMethod) ? ` class="mixed"` : ""}>
          <td>${escapeHtml(row.paymentMethodLabel)}${isMixed(row.paymentMethod) ? ` <span class="badge">Misto</span>` : ""}</td>
          <td class="num">${row.orderCount}</td>
          <td class="num">${escapeHtml(formatBRL(row.totalCents))}</td>
        </tr>`,
    )
    .join("");
  const orderRows = report.orders
    .map(
      (row) =>
        `<tr${isMixed(row.paymentMethod) ? ` class="mixed"` : ""}>
          <td>#${escapeHtml(row.code)}</td>
          <td>${escapeHtml(formatDate(row.createdAt))}</td>
          <td>${escapeHtml(row.customerName || "—")}</td>
          <td>${escapeHtml(row.displayPaymentLabel)}</td>
          <td class="num">${escapeHtml(formatBRL(row.totalCents))}</td>
        </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Vendas por forma de pagamento</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      color: #111;
      font-size: 12px;
      line-height: 1.4;
      margin: 0;
    }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 13px; margin: 18px 0 8px; }
    .meta { color: #444; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; text-align: left; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    .num { text-align: right; white-space: nowrap; }
    .total { font-weight: 700; }
    tr.mixed td { background: #f3eefe; font-weight: 600; }
    .badge {
      display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 4px;
      background: #6d28d9; color: #fff; font-size: 9px; font-weight: 700;
      letter-spacing: 0.06em; text-transform: uppercase; vertical-align: middle;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(storeName)}</h1>
  <div class="meta">
    <strong>Vendas por forma de pagamento</strong><br/>
    Período: ${escapeHtml(formatDayBr(fromDay))} a ${escapeHtml(formatDayBr(toDay))}<br/>
    Forma: ${escapeHtml(paymentFilterLabel)}
  </div>
  <h2>Resumo</h2>
  <table>
    <thead>
      <tr><th>Forma</th><th class="num">Pedidos</th><th class="num">Total</th></tr>
    </thead>
    <tbody>
      ${summaryRows || `<tr><td colspan="3">Sem vendas no período.</td></tr>`}
      <tr class="total">
        <td>Total</td>
        <td class="num">${report.totals.orderCount}</td>
        <td class="num">${escapeHtml(formatBRL(report.totals.totalCents))}</td>
      </tr>
    </tbody>
  </table>
  <h2>Pedidos</h2>
  <table>
    <thead>
      <tr>
        <th>Pedido</th><th>Data</th><th>Cliente</th><th>Pagamento</th><th class="num">Total</th>
      </tr>
    </thead>
    <tbody>
      ${orderRows || `<tr><td colspan="5">Sem pedidos no período.</td></tr>`}
    </tbody>
  </table>
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;

  // Não usar "noopener": no Chrome o open() retorna null mesmo com a aba aberta.
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) {
    throw new Error("Permita pop-ups para gerar o PDF A4.");
  }
  try {
    popup.opener = null;
  } catch {
    // ignore
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

const PAYMENT_FILTER_OPTIONS = (
  Object.entries(PAYMENT_LABEL) as [NonNullable<Order["paymentMethod"]>, string][]
)
  .filter(([value]) => value !== "card")
  .map(([value, label]) => ({ value, label }));

export function SalesByPaymentPage() {
  useLockedViewport();
  const isMobile = useMediaQuery("(max-width: 991px)");
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(
    () => todayRange(),
  );
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [printOpen, setPrintOpen] = useState(false);
  const [printTarget, setPrintTarget] = useState<"thermal" | "pdf">("thermal");
  const [printing, setPrinting] = useState(false);

  const from = dateRange?.[0]?.format("YYYY-MM-DD");
  const to = dateRange?.[1]?.format("YYYY-MM-DD");
  const filters = {
    from: from || undefined,
    to: to || undefined,
    paymentMethods: paymentMethods.length ? paymentMethods : undefined,
  };
  const activeCount = [from, to, paymentMethods.length ? "pay" : ""]
    .filter(Boolean).length;

  const storeQuery = useQuery({
    queryKey: queryKeys.store,
    queryFn: () => api.store(),
  });

  const reportQuery = useQuery({
    queryKey: queryKeys.orders.salesByPayment(filters),
    queryFn: () => api.salesByPaymentReport(filters),
  });

  const report = reportQuery.data;
  const mixedTotals = useMemo(() => {
    const rows = (report?.summary ?? []).filter((row) => isMixed(row.paymentMethod));
    return {
      orderCount: rows.reduce((sum, row) => sum + row.orderCount, 0),
      totalCents: rows.reduce((sum, row) => sum + row.totalCents, 0),
    };
  }, [report]);
  const paymentFilterLabel = useMemo(() => {
    if (!paymentMethods.length) return "Todas";
    return paymentMethods
      .map(
        (value) =>
          PAYMENT_FILTER_OPTIONS.find((item) => item.value === value)?.label ??
          value,
      )
      .join(", ");
  }, [paymentMethods]);

  async function handlePrint() {
    if (!report) return;
    setPrinting(true);
    try {
      const storeName = storeQuery.data?.name?.trim() || "Estabelecimento";
      if (printTarget === "pdf") {
        openSalesReportPdfA4({
          storeName,
          fromDay: from,
          toDay: to,
          paymentFilterLabel,
          report,
        });
        toast.success("Abra a janela de impressão e escolha Salvar como PDF.");
      } else {
        await printSalesByPaymentReportViaAgent({
          storeName,
          fromDay: from,
          toDay: to,
          paymentFilterLabel,
          report: {
            summary: report.summary,
            orders: report.orders,
            totals: report.totals,
          },
        });
        toast.success("Relatório enviado à impressora térmica.");
      }
      setPrintOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao imprimir o relatório.",
      );
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className={cn(listPage, "min-w-0 max-w-full")}>
      <PageHeader
        kicker="Relatórios"
        title="Vendas por forma de pagamento"
        subtitle="Pedidos do período (exceto cancelados), com totais por forma de pagamento."
        extra={
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            disabled={!report || reportQuery.isLoading}
            onClick={() => {
              setPrintTarget("thermal");
              setPrintOpen(true);
            }}
          >
            Imprimir
          </Button>
        }
      />

      <ListFilters
        activeCount={activeCount}
        onClear={() => {
          setDateRange(todayRange());
          setPaymentMethods([]);
        }}
      >
        <DatePicker.RangePicker
          allowClear={false}
          value={dateRange}
          format="DD/MM/YYYY"
          onChange={(value) => setDateRange(value)}
          className="!w-full lg:!w-[260px] lg:max-w-[260px]"
          inputReadOnly
          placement="bottomLeft"
          getPopupContainer={() => document.body}
        />
        <Select
          mode="multiple"
          allowClear
          maxTagCount="responsive"
          className="!w-full lg:!min-w-[240px] lg:!w-[280px] lg:shrink-0"
          value={paymentMethods}
          options={PAYMENT_FILTER_OPTIONS}
          onChange={setPaymentMethods}
          placeholder="Todas as formas"
        />
      </ListFilters>

      <div className="mb-4 grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-food-border bg-food-surface px-4 py-3 max-lg:px-3">
          <Typography.Text type="secondary" className="text-xs uppercase tracking-wide">
            Pedidos
          </Typography.Text>
          <p className="m-0 mt-1 text-2xl font-extrabold tabular-nums text-food-text max-lg:text-xl">
            {report?.totals.orderCount ?? "—"}
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-food-border bg-food-surface px-4 py-3 max-lg:px-3">
          <Typography.Text type="secondary" className="text-xs uppercase tracking-wide">
            Total vendido
          </Typography.Text>
          <p className="m-0 mt-1 truncate text-2xl font-extrabold tabular-nums text-food-accent max-lg:text-xl">
            {report ? formatBRL(report.totals.totalCents) : "—"}
          </p>
        </div>
        <div className="col-span-2 min-w-0 rounded-xl border border-violet-500/30 bg-violet-500/8 px-4 py-3 max-lg:px-3 lg:col-span-1">
          <Typography.Text className="text-xs font-semibold uppercase tracking-wide !text-violet-500">
            Pagamentos mistos
          </Typography.Text>
          <p className="m-0 mt-1 text-2xl font-extrabold tabular-nums text-food-text max-lg:text-xl">
            {report ? formatBRL(mixedTotals.totalCents) : "—"}
          </p>
          <p className="m-0 mt-0.5 text-xs text-food-muted">
            {report
              ? `${mixedTotals.orderCount} ${mixedTotals.orderCount === 1 ? "pedido" : "pedidos"}`
              : ""}
          </p>
        </div>
      </div>

      <Typography.Title level={5} className="!mt-0 !mb-2">
        Resumo por forma
      </Typography.Title>
      {isMobile ? (
        <MobileSummaryList rows={report?.summary ?? []} loading={reportQuery.isLoading} />
      ) : (
      <Table
        className={tableClass}
        size="middle"
        rowKey={(row) => `${row.paymentMethod ?? "none"}-${row.paymentMethodLabel}`}
        loading={reportQuery.isLoading}
        pagination={false}
        dataSource={report?.summary ?? []}
        rowClassName={(row) => (isMixed(row.paymentMethod) ? MIXED_ROW : "")}
        locale={{ emptyText: "Sem vendas no período." }}
        columns={[
          {
            title: "Forma de pagamento",
            dataIndex: "paymentMethodLabel",
            render: (value: string, row) => (
              <PaymentTag label={value} method={row.paymentMethod} />
            ),
          },
          {
            title: "Pedidos",
            dataIndex: "orderCount",
            width: 110,
            align: "right",
          },
          {
            title: "Total",
            dataIndex: "totalCents",
            width: 140,
            align: "right",
            render: (cents: number) => formatBRL(cents),
          },
        ]}
      />
      )}

      <Typography.Title level={5} className="!mt-6 !mb-2">
        Pedidos do período
      </Typography.Title>
      {isMobile ? (
        <MobileOrdersList rows={report?.orders ?? []} loading={reportQuery.isLoading} />
      ) : (
      <Table
        className={tableClass}
        size="middle"
        rowKey="id"
        loading={reportQuery.isLoading}
        pagination={{ pageSize: 50, showSizeChanger: true }}
        dataSource={report?.orders ?? []}
        rowClassName={(row) => (isMixed(row.paymentMethod) ? MIXED_ROW : "")}
        locale={{ emptyText: "Nenhum pedido neste período." }}
        columns={[
          {
            title: "Pedido",
            dataIndex: "code",
            width: 110,
            render: (code: string) => `#${code}`,
          },
          {
            title: "Data",
            dataIndex: "createdAt",
            width: 160,
            render: (value: string) => formatDate(value),
          },
          {
            title: "Cliente",
            dataIndex: "customerName",
            render: (value: string | null) => value || "—",
          },
          {
            title: "Pagamento",
            dataIndex: "displayPaymentLabel",
            render: (value: string, row) =>
              isMixed(row.paymentMethod) ? (
                <PaymentTag label={value} method={row.paymentMethod} />
              ) : (
                value
              ),
          },
          {
            title: "Total",
            dataIndex: "totalCents",
            width: 120,
            align: "right",
            render: (cents: number) => formatBRL(cents),
          },
        ]}
      />
      )}

      <Modal
        title="Imprimir relatório"
        open={printOpen}
        onCancel={() => setPrintOpen(false)}
        okText={printTarget === "thermal" ? "Imprimir na térmica" : "Gerar PDF A4"}
        confirmLoading={printing}
        onOk={() => void handlePrint()}
        destroyOnClose
      >
        <p className="mb-3 text-sm text-food-muted">
          Escolha como deseja sair o relatório.
        </p>
        <Radio.Group
          value={printTarget}
          onChange={(event) => setPrintTarget(event.target.value)}
          className="flex flex-col gap-2"
        >
          <Radio value="thermal">Impressora térmica (padrão)</Radio>
          <Radio value="pdf">A4 / PDF</Radio>
        </Radio.Group>
      </Modal>
    </div>
  );
}
