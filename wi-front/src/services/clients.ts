import { api } from "./api";

export type Client = {
  id: number;
  name: string;
  phone: string;
  cpf: string;
  address: string;
  notes: string;
};

export type ClientCreate = Omit<Client, "id">;

export async function listClients(): Promise<Client[]> {
  const { data } = await api.get<Client[]>("/clients");
  return data;
}

export async function getClient(clientId: number): Promise<Client> {
  const { data } = await api.get<Client>(`/clients/${clientId}`);
  return data;
}

export async function createClient(payload: ClientCreate): Promise<Client> {
  const { data } = await api.post<Client>("/clients", payload);
  return data;
}

export async function updateClient(clientId: number, payload: ClientCreate): Promise<Client> {
  const { data } = await api.put<Client>(`/clients/${clientId}`, payload);
  return data;
}
