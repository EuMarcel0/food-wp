import type { ReactNode } from "react";
import {
  orderPaymentLabel,
  addonLabel,
  crustLabel,
  cashChangeLabel,
  formatBRL,
  formatCnpj,
  formatPhoneDisplay,
  formatReceiptDate
} from "../../lib/format";
import type { Order, Store } from "../../types";

const FISCAL_DISCLAIMER = "Não é válido como documento fiscal.";

function receiptCustomerLine(order: Order) {
  const name = order.customerName?.trim();
  const phone = formatPhoneDisplay(order.customerPhone);
  if (name && phone) return `${name} · ${phone}`;
  return name || phone || "Cliente";
}

function receiptNeighborhood(order: Order, store?: Store) {
  const saved = order.neighborhoodName?.trim();
  if (saved) return saved;
  if (order.fulfillment !== "delivery") return null;
  const zones = store?.neighborhoods ?? [];
  if (!zones.length) return null;
  const address = (order.addressText ?? "").toLowerCase();
  const byAddress = zones.find(zone => address.includes(zone.name.trim().toLowerCase()));
  if (byAddress) return byAddress.name;
  const byFee = zones.filter(zone => zone.feeCents === order.deliveryFeeCents);
  if (byFee.length === 1) return byFee[0].name;
  return null;
}

function SectionTitle({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        margin: "10px 0 6px",
        fontWeight: 800,
        letterSpacing: 0.2,
        textTransform: "uppercase",
        fontSize: 14,
      }}
    >
      <span
        aria-hidden
        style={{ flex: 1, borderTop: "1px dashed #111", minWidth: 12 }}
      />
      <span style={{ flexShrink: 0 }}>{label}</span>
      <span
        aria-hidden
        style={{ flex: 1, borderTop: "1px dashed #111", minWidth: 12 }}
      />
    </div>
  );
}

function Line({ left, right, strong }: { left: string; right?: string; strong?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        fontWeight: strong ? 800 : 700,
        marginBottom: 2,
      }}
    >
      <span style={{ minWidth: 0, wordBreak: "break-word" }}>{left}</span>
      {right ? (
        <>
          <span
            aria-hidden
            style={{
              flex: 1,
              minWidth: 12,
              borderBottom: "1px dotted #111",
              marginBottom: 3,
            }}
          />
          <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{right}</span>
        </>
      ) : null}
    </div>
  );
}

function Block({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "block", marginBottom: 4 }}>{children}</div>
  );
}

export function ReceiptTicket({ order, store }: { order: Order; store?: Store }) {
  const name = store?.name?.trim() || "Estabelecimento";
  const legalName = store?.legalName?.trim();
  const cnpj = store?.cnpj ? formatCnpj(store.cnpj) : "";
  const footer = store?.receiptFooter?.trim();
  const items = order.items ?? [];
  const payment = orderPaymentLabel(order);
  const neighborhood = receiptNeighborhood(order, store);

  return (
    <article
      className="receipt-ticket"
      style={{
        width: "80mm",
        maxWidth: "100%",
        background: "#fff",
        color: "#111",
        fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace',
        fontSize: 16,
        fontWeight: 700,
        padding: "60px 8px 60px",
        boxSizing: "border-box",
      }}
    >
      <header style={{ textAlign: "center" }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: 0.3 }}>{name}</div>
        {legalName ? <div style={{ marginTop: 4 }}>{legalName}</div> : null}
        {cnpj ? <div style={{ marginTop: 2 }}>CNPJ {cnpj}</div> : null}
      </header>

      <SectionTitle label="Pedido" />
      <section>
        <Block>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Pedido #{order.code}</div>
        </Block>
        <Block>{formatReceiptDate(order.createdAt)}</Block>
      </section>

      <SectionTitle label="Cliente" />
      <section>
        <Block>{receiptCustomerLine(order)}</Block>
        <Block>Tipo: {order.fulfillment === "delivery" ? "Entrega" : "Retirada"}</Block>
        {neighborhood ? <Block>Bairro: {neighborhood}</Block> : null}
        {order.fulfillment === "delivery" && order.addressText ? (
          <Block>
            <div style={{ whiteSpace: "pre-wrap" }}>{order.addressText}</div>
          </Block>
        ) : null}
      </section>

      <SectionTitle label="Itens do pedido" />
      <section>
        {items.length ? (
          items.map((item, index) => {
            const crust = crustLabel(item.extras);
            const addons = addonLabel(item.extras);
            const lineTotal = item.quantity * item.unitPriceCents;
            const unit = formatBRL(item.unitPriceCents);
            return (
              <div
                key={item.id ?? `${item.name}-${index}`}
                style={{ marginBottom: 10 }}
              >
                <Line
                  left={`${item.quantity}x ${item.name} (un ${unit})`}
                  right={formatBRL(lineTotal)}
                />
                {item.notes ? (
                  <div style={{ paddingLeft: 8, marginTop: 2 }}>obs.: {item.notes}</div>
                ) : null}
                {crust ? <div style={{ paddingLeft: 8, marginTop: 2 }}>{crust}</div> : null}
                {addons ? <div style={{ paddingLeft: 8, marginTop: 2 }}>{addons}</div> : null}
              </div>
            );
          })
        ) : (
          <Block>Sem itens</Block>
        )}
      </section>

      <SectionTitle label="Pagamento" />
      <section>
        {payment ? <Block>Forma: {payment}</Block> : null}
        <Line left="Subtotal" right={formatBRL(order.subtotalCents)} />
        {order.fulfillment === "delivery" ? (
          <Line
            left={neighborhood ? `Taxa de entrega (${neighborhood})` : "Taxa de entrega"}
            right={formatBRL(order.deliveryFeeCents)}
          />
        ) : null}
        <Line left="TOTAL" right={formatBRL(order.totalCents)} strong />
        {order.paymentMethod === "cash" && order.changeForCents != null ? (
          <div style={{ marginTop: 6 }}>
            {cashChangeLabel(order.changeForCents, order.totalCents)}
          </div>
        ) : null}
      </section>

      {order.notes?.trim() ? (
        <>
          <SectionTitle label="Observações" />
          <footer>
            <div style={{ whiteSpace: "pre-wrap" }}>{order.notes.trim()}</div>
          </footer>
        </>
      ) : null}

      {footer ? (
        <div
          style={{
            marginTop: 12,
            textAlign: "center",
            whiteSpace: "pre-wrap",
          }}
        >
          {footer}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 14,
          paddingTop: 8,
          borderTop: "1px dashed #111",
          textAlign: "center",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {FISCAL_DISCLAIMER}
      </div>
    </article>
  );
}
