import { api } from "./api";
import { jwtDecode } from "jwt-decode";

type LoginResponse = { access_token: string; token_type: string };
type JwtClaims = { role?: string; sub?: string; exp?: number };

export async function login(email: string, password: string) {
  // tenta oauth2 form primeiro
  try {
    const body = new URLSearchParams();
    body.set("username", email);
    body.set("password", password);

    const { data } = await api.post<LoginResponse>("/auth/login", body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("token_type", data.token_type);
    return;
  } catch {
    // fallback json
    const { data } = await api.post<LoginResponse>("/auth/login", { email, password });
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("token_type", data.token_type);
  }
}

export function logout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("token_type");
}

export function getToken(): string | null {
  return localStorage.getItem("access_token");
}

export function getRoleFromToken(): "ADMIN" | "STAFF" | null {
  const token = getToken();
  if (!token) return null;

  try {
    const decoded = jwtDecode<JwtClaims>(token);
    const role = decoded.role?.toUpperCase();
    if (role === "ADMIN" || role === "STAFF") return role;
    return null;
  } catch {
    return null;
  }
}
