import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
  message,
  Upload,
  Image,
  Descriptions,
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import { PlusOutlined } from "@ant-design/icons";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createProduct, getProduct, listProducts, updateProduct } from "../services/products";
import type { Product, ProductStatus, ProductUpsert } from "../services/products";
import { formatMoneyBR } from "../lib/money";

import { api } from "../services/api";

const STATUS_OPTIONS: ProductStatus[] = ["IN_STOCK", "RESERVED", "SOLD"];

const MAX_IMAGES = 4;
const MAX_MB = 2;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

const STATUS_LABEL: Record<ProductStatus, string> = {
  IN_STOCK: "Em estoque",
  RESERVED: "Reservado",
  SOLD: "Vendido",
};

const STATUS_COLOR: Record<ProductStatus, any> = {
  IN_STOCK: "green",
  RESERVED: "gold",
  SOLD: "red",
};

function statusLabel(s?: string | null) {
  const key = String(s || "") as ProductStatus;
  return STATUS_LABEL[key] ?? (s ? String(s) : "-");
}

function statusColor(s?: string | null) {
  const key = String(s || "") as ProductStatus;
  return STATUS_COLOR[key] ?? "default";
}

function normPlate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toUpperCase().replace(/[-\s]/g, "");
  if (!s) return null;
  if (s.length !== 7) return null;
  return s;
}

function toMoneyStr(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function getApiBaseUrl(): string {
  const base = (api.defaults.baseURL ?? "").toString().trim();
  return base || "http://127.0.0.1:8000";
}

function imgUrl(u?: string | null) {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `${getApiBaseUrl()}${u}`;
}

type ProductFilter = "IN_STOCK" | "SOLD" | "RESERVED" | "ALL";

export default function Products() {
  const qc = useQueryClient();

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState<ProductFilter>("IN_STOCK");

  // modal create/edit
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [form] = Form.useForm<ProductUpsert>();

  // modal view details
  const [viewOpen, setViewOpen] = useState(false);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);

  const productsQ = useQuery({
    queryKey: ["products"],
    queryFn: listProducts,
  });

  const createMut = useMutation({
    mutationFn: (payload: ProductUpsert) => createProduct(payload),
    onSuccess: () => {
      message.success("Produto criado!");
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setEditingId(null);
      setFileList([]);
      form.resetFields();
    },
    onError: (e: any) => message.error(e?.response?.data?.detail ?? "Erro ao criar produto"),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: number; data: ProductUpsert }) => updateProduct(payload.id, payload.data),
    onSuccess: () => {
      message.success("Produto atualizado!");
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setEditingId(null);
      setFileList([]);
      form.resetFields();
    },
    onError: (e: any) => message.error(e?.response?.data?.detail ?? "Erro ao atualizar produto"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const data = productsQ.data ?? [];

    const byStatus =
      statusFilter === "ALL"
        ? data
        : data.filter((p) => String(p.status) === String(statusFilter));

    if (!q) return byStatus;

    return byStatus.filter((p) =>
      [p.brand, p.model, p.plate, p.chassi, p.color, p.status]
        .map((v) => String(v ?? "").toLowerCase())
        .some((v) => v.includes(q))
    );
  }, [productsQ.data, search, statusFilter]);

  async function openCreate() {
    setEditingId(null);
    form.resetFields();
    setFileList([]);
    form.setFieldsValue({
      year: new Date().getFullYear(),
      km: 0,
      status: "IN_STOCK",
      cost_price: 0,
      sale_price: 0,
    } as any);
    setOpen(true);
  }

  async function openEdit(id: number) {
    setEditingId(id);
    setOpen(true);
    setLoadingDetails(true);
    setFileList([]);
    try {
      const p = await getProduct(id);
      form.setFieldsValue({
        brand: p.brand,
        model: p.model,
        year: p.year,
        plate: p.plate ?? "",
        chassi: p.chassi,
        km: p.km ?? 0,
        color: p.color,
        cost_price: p.cost_price,
        sale_price: p.sale_price,
        status: p.status,
      } as any);
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "Erro ao carregar produto");
      setOpen(false);
      setEditingId(null);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function openView(id: number) {
    try {
      const p = await getProduct(id);
      setViewProduct(p);
      setViewOpen(true);
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "Erro ao abrir produto");
    }
  }

  return (
    <Card
      title="Produtos"
      extra={
        <Space wrap>
          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            style={{ width: 190 }}
            options={[
              { value: "IN_STOCK", label: "Em estoque" },
              { value: "SOLD", label: "Vendidos" },
              { value: "RESERVED", label: "Reservados" },
              { value: "ALL", label: "Todos" },
            ]}
          />

          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />
          <Button type="primary" onClick={openCreate}>
            Novo produto
          </Button>
        </Space>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {(filtered ?? []).map((p) => {
          const mainImg = p.images?.[0]?.url ? imgUrl(p.images[0].url) : "";
          const s = String(p.status) as ProductStatus;

          return (
            <Card
              key={p.id}
              hoverable
              style={{ overflow: "hidden" }}
              cover={
                mainImg ? (
                  <div style={{ height: 180, overflow: "hidden" }}>
                    <img
                      src={mainImg}
                      alt={`${p.brand} ${p.model}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      height: 180,
                      display: "grid",
                      placeItems: "center",
                      background: "#fafafa",
                      color: "#999",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    Sem foto
                  </div>
                )
              }
              actions={[
                <Button key="view" type="link" onClick={() => openView(p.id)}>
                  Ver
                </Button>,
                <Button key="edit" type="link" onClick={() => openEdit(p.id)}>
                  Editar
                </Button>,
              ]}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.brand} {p.model}
                  </div>
                  <div style={{ color: "#666" }}>
                    {p.year} • {p.plate ?? "-"}
                  </div>
                </div>
                <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{formatMoneyBR(p.sale_price)}</div>
              </div>

              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Tag color={statusColor(s)}>{statusLabel(s)}</Tag>
                <div style={{ color: "#888" }}>#{p.id}</div>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={viewOpen}
        onCancel={() => {
          setViewOpen(false);
          setViewProduct(null);
        }}
        footer={null}
        width={980}
        title={viewProduct ? `${viewProduct.brand} ${viewProduct.model} (#${viewProduct.id})` : "Produto"}
      >
        {viewProduct && (
          <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>
            <div>
              {viewProduct.images?.length ? (
                <Image.PreviewGroup>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {viewProduct.images
                      .slice()
                      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                      .map((img) => (
                        <Image
                          key={img.id ?? img.url}
                          src={imgUrl(img.url)}
                          style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 8 }}
                        />
                      ))}
                  </div>
                </Image.PreviewGroup>
              ) : (
                <div style={{ height: 320, display: "grid", placeItems: "center", background: "#fafafa", color: "#999" }}>
                  Sem imagens
                </div>
              )}
            </div>

            <div>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Marca">{viewProduct.brand}</Descriptions.Item>
                <Descriptions.Item label="Modelo">{viewProduct.model}</Descriptions.Item>
                <Descriptions.Item label="Ano">{viewProduct.year}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={statusColor(viewProduct.status)}>{statusLabel(viewProduct.status)}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Placa">{viewProduct.plate ?? "-"}</Descriptions.Item>
                <Descriptions.Item label="Chassi">{viewProduct.chassi}</Descriptions.Item>
                <Descriptions.Item label="KM">{viewProduct.km ?? "-"}</Descriptions.Item>
                <Descriptions.Item label="Cor">{viewProduct.color}</Descriptions.Item>
                <Descriptions.Item label="Custo">{formatMoneyBR(viewProduct.cost_price)}</Descriptions.Item>
                <Descriptions.Item label="Venda">{formatMoneyBR(viewProduct.sale_price)}</Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button onClick={() => openEdit(viewProduct.id)}>Editar</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title={editingId ? `Editar produto #${editingId}` : "Novo produto"}
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditingId(null);
          setFileList([]);
          form.resetFields();
        }}
        okText={editingId ? "Salvar" : "Criar"}
        confirmLoading={createMut.isPending || updateMut.isPending || loadingDetails}
        onOk={async () => {
          const values = await form.validateFields();

          const plate = normPlate(values.plate);
          const cost = toMoneyStr(values.cost_price);
          const sale = toMoneyStr(values.sale_price);

          if (!cost || !sale) {
            message.error("Preço de custo e venda devem ser números (ex: 12000.00).");
            return;
          }

          const payload: ProductUpsert = {
            brand: String(values.brand).trim(),
            model: String(values.model).trim(),
            year: Number(values.year),
            plate,
            chassi: String(values.chassi).trim().toUpperCase(),
            km: values.km === null || values.km === undefined ? null : Number(values.km),
            color: String(values.color).trim(),
            cost_price: cost,
            sale_price: sale,
            status: String(values.status) as any,
            images: fileList.map((f) => f.originFileObj).filter(Boolean) as File[],
          };

          if (editingId) updateMut.mutate({ id: editingId, data: payload });
          else createMut.mutate(payload);
        }}
      >
        <Form form={form} layout="vertical" disabled={loadingDetails}>
          <Space style={{ display: "flex" }} size={12} wrap>
            <Form.Item name="brand" label="Marca" rules={[{ required: true }]} style={{ minWidth: 240 }}>
              <Input />
            </Form.Item>
            <Form.Item name="model" label="Modelo" rules={[{ required: true }]} style={{ minWidth: 240 }}>
              <Input />
            </Form.Item>
            <Form.Item name="year" label="Ano" rules={[{ required: true }]} style={{ minWidth: 140 }}>
              <InputNumber min={1900} max={2100} style={{ width: "100%" }} controls={false} />
            </Form.Item>
          </Space>

          <Space style={{ display: "flex" }} size={12} wrap>
            <Form.Item name="plate" label="Placa (opcional)" style={{ minWidth: 180 }}>
              <Input placeholder="ABC1D23" />
            </Form.Item>
            <Form.Item name="chassi" label="Chassi" rules={[{ required: true }]} style={{ minWidth: 260 }}>
              <Input />
            </Form.Item>
            <Form.Item name="km" label="KM" style={{ minWidth: 160 }}>
              <InputNumber min={0} style={{ width: "100%" }} controls={false} />
            </Form.Item>
          </Space>

          <Space style={{ display: "flex" }} size={12} wrap>
            <Form.Item name="color" label="Cor" rules={[{ required: true }]} style={{ minWidth: 200 }}>
              <Input />
            </Form.Item>

            <Form.Item name="cost_price" label="Preço de custo" rules={[{ required: true }]} style={{ minWidth: 200 }}>
              <InputNumber min={0} style={{ width: "100%" }} controls={false} />
            </Form.Item>

            <Form.Item name="sale_price" label="Preço de venda" rules={[{ required: true }]} style={{ minWidth: 200 }}>
              <InputNumber min={0} style={{ width: "100%" }} controls={false} />
            </Form.Item>

            <Form.Item name="status" label="Status" rules={[{ required: true }]} style={{ minWidth: 200 }}>
              <Select
                options={STATUS_OPTIONS.map((s) => ({
                  value: s,
                  label: STATUS_LABEL[s],
                }))}
              />
            </Form.Item>
          </Space>

          <Form.Item label={`Imagens (até ${MAX_IMAGES})`}>
            <Upload
              listType="picture-card"
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl.slice(0, MAX_IMAGES))}
              beforeUpload={(file) => {
                if (!ALLOWED.includes(file.type)) {
                  message.error("Formato inválido. Use JPG, PNG ou WEBP.");
                  return Upload.LIST_IGNORE;
                }
                if (file.size / 1024 / 1024 > MAX_MB) {
                  message.error(`Arquivo muito grande. Máx ${MAX_MB}MB.`);
                  return Upload.LIST_IGNORE;
                }
                return false;
              }}
              multiple
              maxCount={MAX_IMAGES}
            >
              {fileList.length >= MAX_IMAGES ? null : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>Adicionar</div>
                </div>
              )}
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
