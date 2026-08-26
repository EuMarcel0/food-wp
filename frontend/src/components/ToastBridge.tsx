import { useEffect } from "react";
import { App } from "antd";
import { bindToast } from "../lib/toast";

export function ToastBridge() {
  const { message } = App.useApp();

  useEffect(() => {
    bindToast({
      error: (content) => {
        void message.error(content);
      },
      success: (content) => {
        void message.success(content);
      },
    });
  }, [message]);

  return null;
}
