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
  price: Yup.string().default("").when("customizable", {
    is: true,
    then: (schema) =>
      schema.test("price", "Informe um preço válido", (value) => {
        if (!value || !value.trim()) return true;
        const amount = parseReais(value);
        return amount !== null && amount >= 0;
      }),
    otherwise: (schema) =>
      schema
        .required("Informe o preço")
        .test("price", "Informe um preço válido", (value) => {
          const amount = parseReais(value ?? "");
          return amount !== null && amount >= 0;
        }),
  }),
  active: Yup.boolean().default(true),
  customizable: Yup.boolean().default(false),
  pizzaKind: Yup.string()
    .nullable()
    .default(null)
    .when("customizable", {
      is: true,
      then: (schema) =>
        schema
          .oneOf(["salgada", "doce"], "Informe se é doce ou salgada")
          .required("Informe se é doce ou salgada"),
      otherwise: (schema) => schema.nullable().notRequired(),
    }),
  notesEnabled: Yup.boolean().default(false),
  addonsEnabled: Yup.boolean().default(false),
  crustsEnabled: Yup.boolean().default(false),
  addonIds: Yup.array().of(Yup.string().required()).default([]),
  optionGroups: Yup.array()
    .of(
      Yup.object({
        id: Yup.string().required(),
        name: Yup.string().trim().required("Informe o nome do grupo"),
        required: Yup.boolean().default(true),
        minSelect: Yup.number().min(0).default(1),
        maxSelect: Yup.number().min(1).default(1),
        priceMode: Yup.mixed<"addon" | "replace">()
          .oneOf(["addon", "replace"])
          .default("addon"),
        exclusiveSet: Yup.string().nullable().default("tamanho"),
        price: Yup.string()
          .default("0,00")
          .test("size-price", "Informe o preço do tamanho", (value) => {
            const amount = parseReais(value ?? "");
            return amount !== null && amount > 0;
          }),
        options: Yup.array()
          .of(
            Yup.object({
              id: Yup.string().required(),
              name: Yup.string().trim().default(""),
              extraPrice: Yup.string().default("0,00"),
              active: Yup.boolean().default(true),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
}).test("pizza", "", function (values) {
  if (!values.customizable) return true;
  if (!values.optionGroups?.length) {
    return this.createError({
      path: "optionGroups",
      message: "Inclua pelo menos um tamanho.",
    });
  }
  return true;
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

export const addonSchema = Yup.object({
  name: Yup.string().trim().required("Informe o nome do adicional"),
  price: Yup.string()
    .required("Informe o valor")
    .test("price", "Informe um valor válido", (value) => {
      const amount = parseReais(value ?? "");
      return amount !== null && amount >= 0;
    }),
  sortOrder: Yup.string()
    .required("Informe a ordem")
    .test("order", "Informe um número inteiro a partir de 0", (value) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= 0;
    }),
  active: Yup.boolean().default(true),
});

export const crustSchema = Yup.object({
  name: Yup.string().trim().required("Informe o nome da borda"),
  pizzaKind: Yup.string()
    .oneOf(["salgada", "doce"], "Informe se é doce ou salgada")
    .required("Informe se é doce ou salgada"),
  addsPrice: Yup.boolean().default(false),
  price: Yup.string().default("").when("addsPrice", {
    is: true,
    then: (schema) =>
      schema
        .required("Informe o preço")
        .test("price", "Informe um valor válido", (value) => {
          const amount = parseReais(value ?? "");
          return amount !== null && amount >= 0;
        }),
    otherwise: (schema) => schema.default(""),
  }),
});

export const sizeSchema = Yup.object({
  name: Yup.string().trim().required("Informe o nome do tamanho"),
  price: Yup.string()
    .required("Informe o preço")
    .test("price", "Informe um valor válido", (value) => {
      const amount = parseReais(value ?? "");
      return amount !== null && amount > 0;
    }),
  maxSelect: Yup.number().min(1).max(10).default(1),
  priceMode: Yup.mixed<"addon" | "replace">()
    .oneOf(["addon", "replace"])
    .default("replace"),
});

const timeSchema = Yup.string().matches(
  /^([01]\d|2[0-3]):[0-5]\d$/,
  "Informe um horário válido",
);

export const storeBrandingSchema = Yup.object({
  name: Yup.string()
    .trim()
    .required("Informe o nome do estabelecimento")
    .min(2, "Use pelo menos 2 caracteres")
    .max(80, "Use no máximo 80 caracteres"),
  hours: Yup.array()
    .of(
      Yup.object({
        day: Yup.number().min(0).max(6).required(),
        closed: Yup.boolean().required(),
        open: Yup.string().when("closed", {
          is: false,
          then: () => timeSchema.required("Informe a abertura"),
          otherwise: (schema) => schema.default("18:00"),
        }),
        close: Yup.string().when("closed", {
          is: false,
          then: () => timeSchema.required("Informe o fechamento"),
          otherwise: (schema) => schema.default("23:00"),
        }),
      }),
    )
    .length(7)
    .required(),
});

export const storeReceiptSchema = Yup.object({
  legalName: Yup.string()
    .trim()
    .max(120, "Use no máximo 120 caracteres")
    .default(""),
  cnpj: Yup.string()
    .trim()
    .default("")
    .test("cnpj", "Informe um CNPJ com 14 dígitos", (value) => {
      const digits = (value ?? "").replace(/\D/g, "");
      return digits.length === 0 || digits.length === 14;
    }),
  receiptFooter: Yup.string()
    .trim()
    .max(240, "Use no máximo 240 caracteres")
    .default(""),
});

export const botSettingsSchema = Yup.object({
  idleTimeoutMinutes: Yup.number()
    .typeError("Informe o tempo em minutos")
    .required("Informe o tempo em minutos")
    .integer("Use um número inteiro")
    .min(1, "Mínimo de 1 minuto")
    .max(10080, "Máximo de 7 dias"),
});

export const prepSettingsSchema = Yup.object({
  defaultAcceptMinutes: Yup.number()
    .typeError("Informe o tempo em minutos")
    .required("Informe o tempo estimado")
    .integer("Use um número inteiro")
    .min(1, "Mínimo de 1 minuto")
    .max(480, "Máximo de 8 horas"),
  autoAcceptOrders: Yup.boolean().default(false),
  allowCustomerCancel: Yup.boolean().default(false),
});

export const defaultDeliveryFeeSchema = Yup.object({
  deliveryFee: Yup.string().test(
    "fee",
    "Informe um valor válido",
    (value) => {
      if (!value || !value.trim()) return true;
      const amount = parseReais(value);
      return amount !== null && amount >= 0;
    },
  ),
});

export const neighborhoodFeeSchema = Yup.object({
  name: Yup.string().trim().required("Informe o bairro"),
  fee: Yup.string()
    .required("Informe a taxa")
    .test("fee", "Informe um valor válido", (value) => {
      const amount = parseReais(value ?? "");
      return amount !== null && amount >= 0;
    }),
});

export type LoginValues = Yup.InferType<typeof loginSchema>;
export type SignupValues = Yup.InferType<typeof signupSchema>;
export type SettingsValues = Yup.InferType<typeof settingsSchema>;
export type ProductValues = Yup.InferType<typeof productSchema>;
export type CategoryValues = Yup.InferType<typeof categorySchema>;
export type AddonValues = Yup.InferType<typeof addonSchema>;
export type CrustValues = Yup.InferType<typeof crustSchema>;
export type SizeValues = Yup.InferType<typeof sizeSchema>;
export type StoreBrandingValues = Yup.InferType<typeof storeBrandingSchema>;
export type StoreReceiptValues = Yup.InferType<typeof storeReceiptSchema>;
export type BotSettingsValues = Yup.InferType<typeof botSettingsSchema>;
export type PrepSettingsValues = Yup.InferType<typeof prepSettingsSchema>;
export type DefaultDeliveryFeeValues = Yup.InferType<typeof defaultDeliveryFeeSchema>;
export type NeighborhoodFeeValues = Yup.InferType<typeof neighborhoodFeeSchema>;

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
