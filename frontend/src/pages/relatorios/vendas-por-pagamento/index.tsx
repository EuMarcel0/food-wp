import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  DatePicker,
  Modal,
  Radio,
  Select,
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
        `<tr>
          <td>${escapeHtml(row.paymentMethodLabel)}</td>
          <td class="num">${row.orderCount}</td>
          <td class="num">${escapeHtml(formatBRL(row.totalCents))}</td>
        </tr>`,
    )
    .join("");
  const orderRows = report.orders
    .map(
      (row) =>
        `<tr>
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
    <div className={listPage}>
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
          className="!w-full max-w-[260px] sm:!w-[260px]"
          inputReadOnly
          placement="bottomLeft"
          getPopupContainer={() => document.body}
        />
        <Select
          mode="multiple"
          allowClear
          maxTagCount="responsive"
          className="!min-w-[240px] !w-[280px] shrink-0"
          value={paymentMethods}
          options={PAYMENT_FILTER_OPTIONS}
          onChange={setPaymentMethods}
          placeholder="Todas as formas"
        />
      </ListFilters>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-food-border bg-food-surface px-4 py-3">
          <Typography.Text type="secondary" className="text-xs uppercase tracking-wide">
            Pedidos
          </Typography.Text>
          <p className="m-0 mt-1 text-2xl font-extrabold tabular-nums text-food-text">
            {report?.totals.orderCount ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-food-border bg-food-surface px-4 py-3 sm:col-span-2">
          <Typography.Text type="secondary" className="text-xs uppercase tracking-wide">
            Total vendido
          </Typography.Text>
          <p className="m-0 mt-1 text-2xl font-extrabold tabular-nums text-food-accent">
            {report ? formatBRL(report.totals.totalCents) : "—"}
          </p>
        </div>
      </div>

      <Typography.Title level={5} className="!mt-0 !mb-2">
        Resumo por forma
      </Typography.Title>
      <Table
        className={tableClass}
        size="middle"
        rowKey={(row) => `${row.paymentMethod ?? "none"}-${row.paymentMethodLabel}`}
        loading={reportQuery.isLoading}
        pagination={false}
        dataSource={report?.summary ?? []}
        locale={{ emptyText: "Sem vendas no período." }}
        columns={[
          {
            title: "Forma de pagamento",
            dataIndex: "paymentMethodLabel",
            render: (value: string) => <Tag color="blue">{value}</Tag>,
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

      <Typography.Title level={5} className="!mt-6 !mb-2">
        Pedidos do período
      </Typography.Title>
      <Table
        className={tableClass}
        size="middle"
        rowKey="id"
        loading={reportQuery.isLoading}
        pagination={{ pageSize: 50, showSizeChanger: true }}
        dataSource={report?.orders ?? []}
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
