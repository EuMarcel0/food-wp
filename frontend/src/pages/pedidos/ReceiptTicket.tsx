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
        fontWeight: 700,
        letterSpacing: 0.2,
        textTransform: "uppercase",
        fontSize: 12,
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 3, fontWeight: 400, lineHeight: 1.35 }}>
      <span style={{ fontWeight: 700 }}>{label}: </span>
      <span style={{ fontWeight: 400 }}>{children}</span>
    </div>
  );
}

function Line({
  left,
  right,
  strong,
  muted,
}: {
  left: string;
  right?: string;
  strong?: boolean;
  /** Preço unitário / linhas secundárias — sem negrito no label. */
  muted?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        fontWeight: 400,
        marginBottom: 2,
      }}
    >
      <span
        style={{
          minWidth: 0,
          wordBreak: "break-word",
          fontWeight: muted ? 400 : 700,
        }}
      >
        {left}
      </span>
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
          <span
            style={{
              flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
              fontWeight: strong ? 700 : 400,
            }}
          >
            {right}
          </span>
        </>
      ) : null}
    </div>
  );
}

function Block({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "block", marginBottom: 4, fontWeight: 400 }}>
      {children}
    </div>
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
  const customerName =
    order.contactName?.trim() || order.customerName?.trim() || "Cliente";
  const phone = formatPhoneDisplay(order.customerPhone);

  return (
    <article
      className="receipt-ticket"
      style={{
        width: "80mm",
        maxWidth: "100%",
        background: "#fff",
        color: "#111",
        fontFamily:
          '"Segoe UI", "Helvetica Neue", Arial, "Noto Sans", sans-serif',
        fontSize: 12,
        fontWeight: 400,
        padding: "60px 8px 60px",
        boxSizing: "border-box",
        lineHeight: 1.35,
      }}
    >
      <header style={{ textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.2 }}>
          {name}
        </div>
        {legalName ? (
          <div style={{ marginTop: 2, fontWeight: 400, fontSize: 11 }}>
            {legalName}
          </div>
        ) : null}
        {cnpj ? (
          <div style={{ marginTop: 2, fontWeight: 400, fontSize: 11 }}>
            CNPJ {cnpj}
          </div>
        ) : null}
      </header>

      <SectionTitle label="Pedido" />
      <section>
        <Field label="Pedido">#{order.code}</Field>
        <Field label="Data">{formatReceiptDate(order.createdAt)}</Field>
      </section>

      <SectionTitle label="Cliente" />
      <section>
        <Field label="Nome">{customerName}</Field>
        {phone ? <Field label="Telefone">{phone}</Field> : null}
        <Field label="Tipo">
          {order.fulfillment === "delivery" ? "Entrega" : "Retirada"}
        </Field>
        {neighborhood ? <Field label="Bairro">{neighborhood}</Field> : null}
        {order.fulfillment === "delivery" && order.addressText ? (
          <Field label="Endereço">
            <span style={{ whiteSpace: "pre-wrap" }}>{order.addressText}</span>
          </Field>
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
                <div style={{ fontWeight: 700, marginBottom: 2 }}>
                  {item.quantity}x {item.name}
                </div>
                <Line
                  left={`(un ${unit})`}
                  right={formatBRL(lineTotal)}
                  muted
                />
                {item.notes ? (
                  <div
                    style={{
                      paddingLeft: 8,
                      marginTop: 2,
                      fontWeight: 400,
                      fontSize: 11,
                    }}
                  >
                    obs.: {item.notes}
                  </div>
                ) : null}
                {crust ? (
                  <div
                    style={{
                      paddingLeft: 8,
                      marginTop: 2,
                      fontWeight: 400,
                      fontSize: 11,
                    }}
                  >
                    {crust}
                  </div>
                ) : null}
                {addons ? (
                  <div
                    style={{
                      paddingLeft: 8,
                      marginTop: 2,
                      fontWeight: 400,
                      fontSize: 11,
                    }}
                  >
                    {addons}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <Block>Sem itens</Block>
        )}
      </section>

      <SectionTitle label="Pagamento" />
      <section>
        {payment ? <Field label="Forma">{payment}</Field> : null}
        <Line left="Subtotal" right={formatBRL(order.subtotalCents)} />
        {order.fulfillment === "delivery" ? (
          <Line
            left={neighborhood ? `Taxa de entrega (${neighborhood})` : "Taxa de entrega"}
            right={formatBRL(order.deliveryFeeCents)}
          />
        ) : null}
        <Line left="TOTAL" right={formatBRL(order.totalCents)} strong />
        {order.paymentMethod === "cash" && order.changeForCents != null ? (
          <div style={{ marginTop: 6, fontWeight: 400 }}>
            {cashChangeLabel(order.changeForCents, order.totalCents)}
          </div>
        ) : null}
      </section>

      {order.notes?.trim() ? (
        <>
          <SectionTitle label="Observações" />
          <footer>
            <div style={{ whiteSpace: "pre-wrap", fontWeight: 400 }}>
              {order.notes.trim()}
            </div>
          </footer>
        </>
      ) : null}

      {footer ? (
        <div
          style={{
            marginTop: 12,
            textAlign: "center",
            whiteSpace: "pre-wrap",
            fontWeight: 400,
            fontSize: 11,
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
          fontSize: 11,
          fontWeight: 400,
        }}
      >
        {FISCAL_DISCLAIMER}
      </div>
    </article>
  );
}
