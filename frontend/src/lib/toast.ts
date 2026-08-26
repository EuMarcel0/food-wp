type ToastFn = (content: string) => void;

let errorFn: ToastFn = () => undefined;
let successFn: ToastFn = () => undefined;

export function bindToast(api: { error: ToastFn; success: ToastFn }) {
  errorFn = api.error;
  successFn = api.success;
}

export const toast = {
  error(content: string) {
    errorFn(content);
  },
  success(content: string) {
    successFn(content);
  },
};
