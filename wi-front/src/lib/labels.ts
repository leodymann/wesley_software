export function labelFromMap(value: unknown, map: Record<string, string>, fallback = "-") {
  const k = String(value ?? "");
  return map[k] ?? (k ? k : fallback);
}

export const SALE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  CONFIRMED: "Confirmada",
  CANCELED: "Cancelada",
};

export const PRODUCT_STATUS_LABEL: Record<string, string> = {
  IN_STOCK: "Em estoque",
  RESERVED: "Reservado",
  SOLD: "Vendido",
};

export const PROMISSORY_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  ISSUED: "Emitida",
  CANCELED: "Cancelada",
  PAID: "Quitada",
};

export const INSTALLMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  PAID: "Paga",
  CANCELED: "Cancelada",
};

export const FINANCE_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  PAID: "Pago",
  CANCELED: "Cancelado",
};

export const PAYMENT_TYPE_LABEL: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  CARD: "Cartão",
  PROMISSORY: "Promissória",
};

export const TAG_COLOR: Record<string, any> = {
  DRAFT: "default",
  CONFIRMED: "blue",
  ISSUED: "blue",
  PENDING: "orange",
  PAID: "green",
  SOLD: "green",
  RESERVED: "gold",
  IN_STOCK: "cyan",
  CANCELED: "red",
};
