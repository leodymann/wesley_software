import { api } from "./api";

export type ProductStatus = "IN_STOCK" | "RESERVED" | "SOLD";

export type ProductImage = {
  id: number;
  url: string;
  position: number;
  created_at?: string;
};

export type Product = {
  id: number;
  brand: string;
  model: string;
  year: number;
  plate: string | null;
  chassi: string;
  km: number | null;
  color: string;

  // decimal geralmente sai como string
  cost_price: string;
  sale_price: string;

  status: ProductStatus;
  images: ProductImage[];
};

export type ProductUpsert = {
  brand: string;
  model: string;
  year: number;
  plate?: string | null;
  chassi: string;
  km?: number | null;
  color: string;
  cost_price: number | string;
  sale_price: number | string;
  status: ProductStatus;

  images?: File[];
};

function toFormData(payload: ProductUpsert): FormData {
  const fd = new FormData();

  fd.append("brand", String(payload.brand ?? ""));
  fd.append("model", String(payload.model ?? ""));
  fd.append("year", String(payload.year ?? ""));

  // opcional
  if (payload.plate) fd.append("plate", String(payload.plate));

  fd.append("chassi", String(payload.chassi ?? ""));

  // opcional/nullable
  if (payload.km !== undefined && payload.km !== null) fd.append("km", String(payload.km));

  fd.append("color", String(payload.color ?? ""));

  // Numeric/Decimal: string 
  fd.append("cost_price", String(payload.cost_price ?? ""));
  fd.append("sale_price", String(payload.sale_price ?? ""));

  fd.append("status", String(payload.status ?? ""));

  if (payload.images && Array.isArray(payload.images)) {
    for (const file of payload.images) {
      fd.append("images", file);
    }
  }

  return fd;
}

export async function listProducts(): Promise<Product[]> {
  const { data } = await api.get<Product[]>("/products");
  return data;
}

export async function getProduct(productId: number): Promise<Product> {
  const { data } = await api.get<Product>(`/products/${productId}`);
  return data;
}

/** POST /products -> multipart/form-data */
export async function createProduct(payload: ProductUpsert): Promise<Product> {
  const fd = toFormData(payload);
  const { data } = await api.post<Product>("/products", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/** PUT /products/{id} -> multipart/form-data */
export async function updateProduct(productId: number, payload: ProductUpsert): Promise<Product> {
  const fd = toFormData(payload);
  const { data } = await api.put<Product>(`/products/${productId}`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
