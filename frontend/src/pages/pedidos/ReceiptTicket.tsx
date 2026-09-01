import {
  PAYMENT_LABEL,
  addonLabel,
  crustLabel,
  cashChangeLabel,
  formatBRL,
  formatCnpj,
  formatPhoneDisplay,
  formatReceiptDate
} from "../../lib/format";
import type { Order, Store } from "../../types";

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

function Dash() {
  return (
    <div
      aria-hidden
      style={{
        borderTop: "1px dashed #111",
        margin: "8px 0"
      }}
    />
  );
}

function Line({ left, right, strong }: { left: string; right?: string; strong?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        fontWeight: strong ? 700 : 400
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
              marginBottom: 3
            }}
          />
          <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{right}</span>
        </>
      ) : null}
    </div>
  );
}

export function ReceiptTicket({ order, store }: { order: Order; store?: Store }) {
  const name = store?.name?.trim() || "Estabelecimento";
  const legalName = store?.legalName?.trim();
  const cnpj = store?.cnpj ? formatCnpj(store.cnpj) : "";
  const footer = store?.receiptFooter?.trim();
  const items = order.items ?? [];
  const payment = order.paymentMethod ? PAYMENT_LABEL[order.paymentMethod] : null;
  const neighborhood = receiptNeighborhood(order, store);

  return (
    <article
      className='receipt-ticket'
      style={{
        width: "80mm",
        maxWidth: "100%",
        background: "#fff",
        color: "#111",
        fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace',
        fontSize: 12,
        lineHeight: 1.35,
        padding: "10px 8px 14px",
        boxSizing: "border-box"
      }}
    >
      <header style={{ textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.3 }}>{name}</div>
        {legalName ? <div style={{ marginTop: 2 }}>{legalName}</div> : null}
        {cnpj ? <div>CNPJ {cnpj}</div> : null}
      </header>

      <Dash />

      <section style={{ display: "block" }}>
        <div style={{ display: "block", fontSize: 14, fontWeight: 800 }}>
          Pedido #{order.code}
        </div>
        <div style={{ display: "block" }}>{formatReceiptDate(order.createdAt)}</div>
        <div style={{ display: "block" }}>{receiptCustomerLine(order)}</div>
        <div style={{ display: "block" }}>
          Tipo: {order.fulfillment === "delivery" ? "Entrega" : "Retirada"}
        </div>
        {payment ? <div style={{ display: "block" }}>Forma de pag.: {payment}</div> : null}
        {neighborhood ? (
          <div style={{ display: "block" }}>Bairro: {neighborhood}</div>
        ) : null}
        {order.fulfillment === "delivery" && order.addressText ? (
          <div style={{ display: "block", marginTop: 4, whiteSpace: "pre-wrap" }}>
            {order.addressText}
          </div>
        ) : null}
      </section>

      <Dash />

      <section>
        {items.length ? (
          items.map((item, index) => {
            const crust = crustLabel(item.extras);
            const addons = addonLabel(item.extras);
            const lineTotal = item.quantity * item.unitPriceCents;
            const unit = formatBRL(item.unitPriceCents);
            return (
              <div key={item.id ?? `${item.name}-${index}`} style={{ marginBottom: 8 }}>
                <Line left={`${item.quantity}x ${item.name} (un ${unit})`} right={formatBRL(lineTotal)} />
                {item.notes ? <div style={{ paddingLeft: 8, opacity: 0.85 }}>obs.: {item.notes}</div> : null}
                {crust ? <div style={{ paddingLeft: 8, opacity: 0.85 }}>{crust}</div> : null}
                {addons ? <div style={{ paddingLeft: 8, opacity: 0.85 }}>{addons}</div> : null}
              </div>
            );
          })
        ) : (
          <div>Sem itens</div>
        )}
      </section>

      <Dash />

      <section>
        <Line left='Subtotal' right={formatBRL(order.subtotalCents)} />
        {order.fulfillment === "delivery" ? (
          <Line
            left={neighborhood ? `Taxa de entrega (${neighborhood})` : "Taxa de entrega"}
            right={formatBRL(order.deliveryFeeCents)}
          />
        ) : null}
        <Line left='Total' right={formatBRL(order.totalCents)} strong />
        {order.paymentMethod === "cash" && order.changeForCents != null ? (
          <div style={{ marginTop: 4 }}>{cashChangeLabel(order.changeForCents, order.totalCents)}</div>
        ) : null}
      </section>

      {order.notes?.trim() || footer ? (
        <>
          <Dash />
          <footer>
            {order.notes?.trim() ? (
              <div style={{ whiteSpace: "pre-wrap" }}>Obs. da entrega: {order.notes.trim()}</div>
            ) : null}
            {footer ? (
              <div
                style={{
                  marginTop: order.notes?.trim() ? 8 : 0,
                  textAlign: "center",
                  whiteSpace: "pre-wrap"
                }}
              >
                {footer}
              </div>
            ) : null}
          </footer>
        </>
      ) : null}
    </article>
  );
}
