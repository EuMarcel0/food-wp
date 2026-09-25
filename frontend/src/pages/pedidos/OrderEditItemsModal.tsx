import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, InputNumber, Modal, Select, Space } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { api } from "../../lib/api";
import { formatBRL } from "../../lib/format";
import { queryKeys } from "../../lib/queryKeys";
import type { Order, OrderItem, Product } from "../../types";

type DraftItem = {
  key: string;
  id?: string;
  productId?: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
  notes?: string | null;
};

function toDraft(items: OrderItem[] | undefined): DraftItem[] {
  return (items ?? []).map((item, index) => ({
    key: item.id ?? `existing-${index}`,
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    notes: item.notes ?? null,
  }));
}

function productUnitCents(product: Product) {
  if (product.price > 0) return Math.round(product.price * 100);
  const sizes = (product.optionGroups ?? []).filter((group) =>
    /tamanho|size|fam[ií]lia|grande|m[eé]dia|pequena/i.test(group.name),
  );
  const prices = sizes
    .map((group) => Math.round(Number(group.price) * 100))
    .filter((cents) => Number.isFinite(cents) && cents > 0);
  if (prices.length) return Math.min(...prices);
  return 0;
}

export function OrderEditItemsModal({
  order,
  open,
  submitting,
  onCancel,
  onSave,
}: {
  order: Order | null;
  open: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSave: (items: DraftItem[]) => void;
}) {
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [productId, setProductId] = useState<string | undefined>();
  const [addQty, setAddQty] = useState(1);

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list(1, 200, { active: true }),
    queryFn: () => api.products(1, 200, { active: true }),
    enabled: open,
  });
  const products = productsQuery.data?.items ?? [];

  useEffect(() => {
    if (open && order) {
      setDraft(toDraft(order.items));
      setProductId(undefined);
      setAddQty(1);
    }
  }, [open, order?.id]);

  const subtotalCents = useMemo(
    () => draft.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0),
    [draft],
  );
  const totalCents = subtotalCents + (order?.deliveryFeeCents ?? 0);

  function addProduct() {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setDraft((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        productId: product.id,
        name: product.name,
        quantity: Math.max(1, addQty || 1),
        unitPriceCents: productUnitCents(product),
        notes: null,
      },
    ]);
    setProductId(undefined);
    setAddQty(1);
  }

  return (
    <Modal
      title={order ? `Editar itens · #${order.code}` : "Editar itens"}
      open={open}
      onCancel={onCancel}
      onOk={() => onSave(draft)}
      okText="Salvar itens"
      cancelText="Cancelar"
      confirmLoading={submitting}
      okButtonProps={{ disabled: submitting || draft.length === 0 }}
      width={720}
      destroyOnHidden
      centered
      className="order-edit-items-modal"
      styles={{
        body: {
          maxHeight: "calc(100dvh - 160px)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          paddingTop: 12,
          paddingBottom: 8,
        },
      }}
    >
      <p className="mb-3 shrink-0 text-sm text-food-muted">
        Adicione ou remova itens. O total do pedido é recalculado (taxa de entrega
        mantida).
      </p>

      <div className="mb-3 flex shrink-0 flex-wrap items-end gap-2 rounded-lg border border-food-border bg-food-surface p-3">
        <div className="min-w-0 flex-1 basis-[12rem]">
          <div className="mb-1 text-xs font-medium text-food-muted">Produto</div>
          <Select
            className="w-full"
            showSearch
            optionFilterProp="label"
            placeholder="Escolher do cardápio"
            loading={productsQuery.isLoading}
            value={productId}
            options={products.map((product) => ({
              value: product.id,
              label: `${product.name} · ${formatBRL(productUnitCents(product))}`,
            }))}
            onChange={setProductId}
            getPopupContainer={(node) => node.parentElement ?? document.body}
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-food-muted">Qtd</div>
          <InputNumber min={1} max={99} value={addQty} onChange={(v) => setAddQty(Number(v) || 1)} />
        </div>
        <Button type="primary" icon={<PlusOutlined />} disabled={!productId} onClick={addProduct}>
          Adicionar
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
        <div className="flex flex-col gap-3 pb-1">
          {draft.map((item) => (
            <div
              key={item.key}
              className="grid grid-cols-1 gap-2 rounded-lg border border-food-border p-3 sm:grid-cols-[1fr_88px_120px_40px]"
            >
              <div>
                <div className="mb-1 text-xs font-medium text-food-muted">Item</div>
                <Input
                  value={item.name}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev.map((row) =>
                        row.key === item.key ? { ...row, name: event.target.value } : row,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-food-muted">Qtd</div>
                <InputNumber
                  className="w-full"
                  min={1}
                  max={99}
                  value={item.quantity}
                  onChange={(value) =>
                    setDraft((prev) =>
                      prev.map((row) =>
                        row.key === item.key
                          ? { ...row, quantity: Math.max(1, Number(value) || 1) }
                          : row,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-food-muted">Unitário (R$)</div>
                <InputNumber
                  className="w-full"
                  min={0}
                  step={0.5}
                  value={item.unitPriceCents / 100}
                  onChange={(value) =>
                    setDraft((prev) =>
                      prev.map((row) =>
                        row.key === item.key
                          ? {
                              ...row,
                              unitPriceCents: Math.max(
                                0,
                                Math.round((Number(value) || 0) * 100),
                              ),
                            }
                          : row,
                      ),
                    )
                  }
                />
              </div>
              <div className="flex items-end justify-end">
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`Remover ${item.name}`}
                  disabled={draft.length <= 1}
                  onClick={() => setDraft((prev) => prev.filter((row) => row.key !== item.key))}
                />
              </div>
              <div className="sm:col-span-4">
                <Space size="small" className="text-xs text-food-muted">
                  <span>Linha: {formatBRL(item.quantity * item.unitPriceCents)}</span>
                </Space>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex shrink-0 flex-col gap-1 border-t border-food-border pt-3 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <strong>{formatBRL(subtotalCents)}</strong>
        </div>
        <div className="flex justify-between text-food-muted">
          <span>Entrega</span>
          <span>{formatBRL(order?.deliveryFeeCents ?? 0)}</span>
        </div>
        <div className="flex justify-between text-base">
          <span>Total</span>
          <strong>{formatBRL(totalCents)}</strong>
        </div>
      </div>
    </Modal>
  );
}
