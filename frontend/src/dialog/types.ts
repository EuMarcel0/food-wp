import type { ReactNode } from "react";
import type { ModalProps } from "antd";

export type DialogVariant =
  | "confirm"
  | "delete"
  | "alert"
  | "info"
  | "warning"
  | "success";

export type DialogOptions = {
  title?: ReactNode;
  description?: ReactNode;
  content?: ReactNode;
  okText?: string;
  cancelText?: string;
  showCancel?: boolean;
  okDanger?: boolean;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
  width?: ModalProps["width"];
  centered?: boolean;
  closable?: boolean;
  maskClosable?: boolean;
  keyboard?: boolean;
  icon?: ReactNode;
  modalProps?: Omit<
    ModalProps,
    "open" | "title" | "onOk" | "onCancel" | "confirmLoading" | "children"
  >;
};

export type DialogApi = {
  open: (variant: DialogVariant, options?: DialogOptions) => Promise<boolean>;
  confirm: (options?: DialogOptions) => Promise<boolean>;
  delete: (options?: DialogOptions) => Promise<boolean>;
  alert: (options?: DialogOptions) => Promise<boolean>;
  info: (options?: DialogOptions) => Promise<boolean>;
  warning: (options?: DialogOptions) => Promise<boolean>;
  success: (options?: DialogOptions) => Promise<boolean>;
};
