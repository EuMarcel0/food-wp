import {
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  InfoCircleFilled,
} from "@ant-design/icons";
import { Modal, Typography } from "antd";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DialogApi, DialogOptions, DialogVariant } from "./types";
import "./dialog.css";

type DialogRequest = {
  id: number;
  variant: DialogVariant;
  options: DialogOptions;
  resolve: (confirmed: boolean) => void;
};

const DialogContext = createContext<DialogApi | null>(null);

const VARIANT_DEFAULTS: Record<
  DialogVariant,
  Pick<DialogOptions, "title" | "okText" | "cancelText" | "showCancel" | "okDanger"> & {
    icon: ReactNode;
  }
> = {
  confirm: {
    title: "Confirmar",
    okText: "Confirmar",
    cancelText: "Cancelar",
    showCancel: true,
    okDanger: false,
    icon: <ExclamationCircleFilled className="app-dialog-icon is-confirm" />,
  },
  delete: {
    title: "Excluir",
    okText: "Excluir",
    cancelText: "Cancelar",
    showCancel: true,
    okDanger: true,
    icon: <CloseCircleFilled className="app-dialog-icon is-delete" />,
  },
  alert: {
    title: "Atenção",
    okText: "Entendi",
    showCancel: false,
    okDanger: false,
    icon: <ExclamationCircleFilled className="app-dialog-icon is-alert" />,
  },
  info: {
    title: "Informação",
    okText: "Ok",
    showCancel: false,
    okDanger: false,
    icon: <InfoCircleFilled className="app-dialog-icon is-info" />,
  },
  warning: {
    title: "Atenção",
    okText: "Continuar",
    cancelText: "Cancelar",
    showCancel: true,
    okDanger: false,
    icon: <ExclamationCircleFilled className="app-dialog-icon is-warning" />,
  },
  success: {
    title: "Pronto",
    okText: "Ok",
    showCancel: false,
    okDanger: false,
    icon: <CheckCircleFilled className="app-dialog-icon is-success" />,
  },
};

export function DialogProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(1);
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const current = queue[0] ?? null;

  const dismiss = useCallback((id: number, confirmed: boolean) => {
    setQueue((items) => {
      const item = items.find((entry) => entry.id === id);
      item?.resolve(confirmed);
      return items.filter((entry) => entry.id !== id);
    });
    setBusy(false);
  }, []);

  const open = useCallback((variant: DialogVariant, options: DialogOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setQueue((items) => [
        ...items,
        { id: nextId.current++, variant, options, resolve },
      ]);
    });
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      open,
      confirm: (options) => open("confirm", options),
      delete: (options) => open("delete", options),
      alert: (options) => open("alert", options),
      info: (options) => open("info", options),
      warning: (options) => open("warning", options),
      success: (options) => open("success", options),
    }),
    [open],
  );

  const defaults = current ? VARIANT_DEFAULTS[current.variant] : null;
  const options = current?.options;
  const showCancel = options?.showCancel ?? defaults?.showCancel ?? true;

  async function handleConfirm() {
    if (!current) return;
    setBusy(true);
    try {
      await current.options.onConfirm?.();
      dismiss(current.id, true);
    } catch {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!current || busy) return;
    try {
      await current.options.onCancel?.();
    } finally {
      dismiss(current.id, false);
    }
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal
        {...(options?.modalProps ?? {})}
        className={["app-dialog", options?.modalProps?.className]
          .filter(Boolean)
          .join(" ")}
        open={Boolean(current)}
        title={
          <div className="app-dialog-title">
            {options?.icon ?? defaults?.icon}
            <span>{options?.title ?? defaults?.title}</span>
          </div>
        }
        okText={options?.okText ?? defaults?.okText}
        cancelText={options?.cancelText ?? defaults?.cancelText}
        okButtonProps={{
          ...options?.modalProps?.okButtonProps,
          danger: options?.okDanger ?? defaults?.okDanger,
          loading: busy,
        }}
        cancelButtonProps={{
          ...options?.modalProps?.cancelButtonProps,
          disabled: busy,
        }}
        confirmLoading={busy}
        width={options?.width ?? 440}
        centered={options?.centered ?? true}
        closable={options?.closable ?? !busy}
        maskClosable={options?.maskClosable ?? !busy}
        keyboard={options?.keyboard ?? !busy}
        destroyOnHidden
        footer={
          options?.modalProps?.footer !== undefined
            ? options.modalProps.footer
            : (_, { OkBtn, CancelBtn }) => (
                <>
                  {showCancel ? <CancelBtn /> : null}
                  <OkBtn />
                </>
              )
        }
        onOk={handleConfirm}
        onCancel={handleCancel}
      >
        {options?.description ? (
          <Typography.Paragraph
            className={
              options.content
                ? "app-dialog-description has-content"
                : "app-dialog-description"
            }
          >
            {options.description}
          </Typography.Paragraph>
        ) : null}
        {options?.content}
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog precisa estar dentro de DialogProvider");
  }
  return context;
}
