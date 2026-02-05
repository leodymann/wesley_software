import { api } from "./api";

export type FinanceStatus = "PENDING" | "PAID" | "CANCELED";
export type WppSendStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";

export type Finance = {
  id: number;
  company: string;
  amount: string; // decimal vem como string
  due_date: string;
  status: FinanceStatus;

  description?: string | null;
  notes?: string | null;

  wpp_status?: WppSendStatus | null;
  wpp_tries?: number | null;
  wpp_last_error?: string | null;
  wpp_sent_at?: string | null;
  wpp_next_retry_at?: string | null;

  created_at?: string | null;
};

export type FinanceCreate = {
  company: string;
  amount: number | string; // aceita number no front
  due_date: string;
  status?: FinanceStatus;
  description?: string;
  notes?: string;
};

export type FinanceUpdate = Partial<FinanceCreate>;

export async function listFinance(): Promise<Finance[]> {
  const { data } = await api.get<Finance[]>("/finance");
  return data;
}

export async function getFinance(financeId: number): Promise<Finance> {
  const { data } = await api.get<Finance>(`/finance/${financeId}`);
  return data;
}

export async function createFinance(payload: FinanceCreate): Promise<Finance> {
  // garante amount em string
  const body = {
    ...payload,
    amount: typeof payload.amount === "number" ? payload.amount.toFixed(2) : payload.amount,
    status: payload.status ?? "PENDING",
  };

  const { data } = await api.post<Finance>("/finance", body, {
    headers: { "Content-Type": "application/json" },
  });
  return data;
}

export async function updateFinance(financeId: number, payload: FinanceUpdate): Promise<Finance> {
  const body: any = { ...payload };

  if (body.amount != null) {
    body.amount = typeof body.amount === "number" ? body.amount.toFixed(2) : body.amount;
  }

  const { data } = await api.put<Finance>(`/finance/${financeId}`, body, {
    headers: { "Content-Type": "application/json" },
  });
  return data;
}

export async function payFinance(financeId: number): Promise<Finance> {
  const { data } = await api.post<Finance>(`/finance/${financeId}/pay`, {}, {
    headers: { "Content-Type": "application/json" },
  });
  return data;
}
