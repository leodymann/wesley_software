import { api } from "./api";

export type Promissory = {
  id: number;
  public_id: string;
  status: string;
  total: string;
  entry_amount: string;
  issued_at: string;
  client_id: number;
  product_id: number;
  sale_id: number;
};

export async function listPromissories(): Promise<Promissory[]> {
  const { data } = await api.get<Promissory[]>("/promissories");
  return data;
}

export async function getPromissory(promId: number): Promise<Promissory> {
  const { data } = await api.get<Promissory>(`/promissories/${promId}`);
  return data;
}

export async function issuePromissory(promId: number) {
  const { data } = await api.post(`/promissories/${promId}/issue`);
  return data;
}

export async function cancelPromissory(promId: number) {
  const { data } = await api.patch(`/promissories/${promId}/cancel`);
  return data;
}
