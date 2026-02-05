import { api } from "./api";

export type UserRole = "ADMIN" | "STAFF";

export type UserOut = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  created_at?: string;
};

export type UserCreate = {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
};

export async function createUser(payload: UserCreate): Promise<UserOut> {
  const { data } = await api.post("/users", payload);
  return data;
}

export async function listUsers(params?: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<UserOut[]> {
  const { data } = await api.get("/users", { params });
  return data;
}
