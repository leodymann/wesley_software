import { api } from "./api";

export type SaleCreate = {
  client_id: number;
  user_id: number;
  product_id: number;
  total: number;
  discount: number;
  entry_amount: number;
  payment_type: string;
  installments_count: number;
  first_due_date: string;
};

export async function createSale(payload: SaleCreate) {
  const { data } = await api.post("/sales", payload);
  return data;
}

export async function listSales() {
  const { data } = await api.get("/sales");
  return data;
}

export async function updateSaleStatus(saleId: number, status: string) {
  const { data } = await api.patch(`/sales/${saleId}/status`, { status });
  return data;
}
