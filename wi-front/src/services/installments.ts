import { api } from "./api";

export type InstallmentStatus = "PENDING" | "PAID" | "CANCELED";

export type Installment = {
  id: number;
  promissory_id: number;
  number: number;
  due_date: string;
  amount: string; // decimal vira string no backend
  status: InstallmentStatus;

  paid_at?: string | null;
  paid_amount?: string | null;
  note?: string | null;
};

export async function listInstallments(): Promise<Installment[]> {
  const { data } = await api.get<Installment[]>("/installments");
  return data;
}

/**
 * POST /installments/{inst_id}/pay
 * Backend espera BODY (JSON). Se mandar vazio => 422 "body field required".
 */
export async function payInstallment(
  instId: number,
  paid_amount: number,
  note?: string
): Promise<Installment> {
  const payload: Record<string, any> = {
    paid_amount,
  };
  if (note && note.trim()) payload.note = note.trim();

  const { data } = await api.post<Installment>(`/installments/${instId}/pay`, payload, {
    headers: { "Content-Type": "application/json" },
  });

  return data;
}
