import {
  cloneElement,
  type ChangeEventHandler,
  type FocusEventHandler,
  type ReactElement,
  type ReactNode,
} from "react";
import { useField } from "formik";
import { Form } from "antd";

function fieldError(error: unknown): string | undefined {
  if (!error) return undefined;
  if (typeof error === "string") return error;
  if (Array.isArray(error)) {
    return error.map(fieldError).find(Boolean);
  }
  if (typeof error === "object") {
    return Object.values(error as Record<string, unknown>)
      .map(fieldError)
      .find(Boolean);
  }
  return undefined;
}

type FieldProps = {
  name?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
};

export function FormField({
  name,
  label,
  children,
}: {
  name: string;
  label: string;
  children: ReactElement<FieldProps>;
}) {
  const [field, meta] = useField(name);
  const message = fieldError(meta.error);
  const invalid = meta.touched && Boolean(message);

  return (
    <Form layout="vertical" requiredMark={false} component={false}>
      <Form.Item
        label={label || undefined}
        validateStatus={invalid ? "error" : ""}
        help={invalid ? message : undefined}
        style={{ marginBottom: 12 }}
      >
      {cloneElement(children, field)}
    </Form.Item>
    </Form>
  );
}

export function FormControl({
  name,
  label,
  children,
}: {
  name: string;
  label: string;
  children: (helpers: {
    value: unknown;
    invalid: boolean;
    setValue: (value: unknown) => void;
    setTouched: () => void;
  }) => ReactNode;
}) {
  const [field, meta, helpers] = useField(name);
  const message = fieldError(meta.error);
  const invalid = meta.touched && Boolean(message);

  return (
    <Form layout="vertical" requiredMark={false} component={false}>
      <Form.Item
        label={label}
        validateStatus={invalid ? "error" : ""}
        help={invalid ? message : undefined}
        style={{ marginBottom: 12 }}
      >
        {children({
          value: field.value,
          invalid,
          setValue: helpers.setValue,
          setTouched: () => helpers.setTouched(true),
        })}
      </Form.Item>
    </Form>
  );
}
