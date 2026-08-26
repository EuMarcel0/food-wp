import * as Yup from "yup";

export const loginSchema = Yup.object({
  email: Yup.string()
    .trim()
    .email("E-mail inválido")
    .required("Informe o e-mail"),
  password: Yup.string().required("Informe a senha"),
});

export const signupSchema = Yup.object({
  name: Yup.string().trim().required("Informe o nome"),
  email: Yup.string()
    .trim()
    .email("E-mail inválido")
    .required("Informe o e-mail"),
  password: Yup.string()
    .min(6, "Mínimo de 6 caracteres")
    .required("Informe a senha"),
  confirm: Yup.string()
    .required("Repita a senha")
    .oneOf([Yup.ref("password")], "As senhas não coincidem"),
});

export const settingsSchema = Yup.object({
  name: Yup.string().trim().required("Informe o nome"),
  currentPassword: Yup.string().default(""),
  newPassword: Yup.string().default(""),
  confirmPassword: Yup.string().default(""),
}).test("password-group", "", function (values) {
  const changing = Boolean(
    values.currentPassword || values.newPassword || values.confirmPassword,
  );
  if (!changing) return true;
  if (!values.currentPassword) {
    return this.createError({
      path: "currentPassword",
      message: "Informe a senha atual",
    });
  }
  if (!values.newPassword || values.newPassword.length < 6) {
    return this.createError({
      path: "newPassword",
      message: "A nova senha precisa ter pelo menos 6 caracteres",
    });
  }
  if (values.confirmPassword !== values.newPassword) {
    return this.createError({
      path: "confirmPassword",
      message: "As senhas não coincidem",
    });
  }
  return true;
});

export const productSchema = Yup.object({
  name: Yup.string().trim().required("Informe o nome do item"),
  categoryId: Yup.string().required("Escolha a categoria"),
  description: Yup.string().trim().default(""),
  price: Yup.string()
    .required("Informe o preço")
    .test("price", "Informe um preço válido", (value) => {
      const amount = parseReais(value ?? "");
      return amount !== null && amount >= 0;
    }),
  active: Yup.boolean().default(true),
});

export const categorySchema = Yup.object({
  name: Yup.string().trim().required("Informe o nome da categoria"),
  sortOrder: Yup.string()
    .required("Informe a ordem")
    .test("order", "Informe um número inteiro a partir de 0", (value) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= 0;
    }),
  active: Yup.boolean().default(true),
});

export type LoginValues = Yup.InferType<typeof loginSchema>;
export type SignupValues = Yup.InferType<typeof signupSchema>;
export type SettingsValues = Yup.InferType<typeof settingsSchema>;
export type ProductValues = Yup.InferType<typeof productSchema>;
export type CategoryValues = Yup.InferType<typeof categorySchema>;

export function parseReais(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

export function maskBRL(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  const cents = Number(digits || "0");
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
