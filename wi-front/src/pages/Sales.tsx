import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
  Statistic,
  Row,
  Col,
  Divider,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createSale, listSales, updateSaleStatus } from "../services/sales";
import type { SaleCreate } from "../services/sales";

import { listClients } from "../services/clients";
import type { Client } from "../services/clients";

import { listProducts } from "../services/products";
import type { Product } from "../services/products";

type AnySale = {
  id: number;
  public_id?: string;
  status?: string;
  payment_type?: string;
  total?: string | number;
  discount?: string | number;
  entry_amount?: string | number;

  client_id?: number;
  product_id?: number;
  user_id?: number;
  created_at?: string;
};

const STATUS_OPTIONS = ["DRAFT", "CONFIRMED", "CANCELED"] as const;
const PAYMENT_TYPES = ["CASH", "PIX", "CARD", "PROMISSORY"] as const;


const SALE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  CONFIRMED: "Confirmada",
  CANCELED: "Cancelada",
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  CARD: "Cartão",
  PROMISSORY: "Promissória",
};

function saleStatusLabel(status?: string | null) {
  const s = String(status || "");
  return SALE_STATUS_LABEL[s] ?? (s || "-");
}

function paymentLabel(p?: string | null) {
  const s = String(p || "");
  return PAYMENT_LABEL[s] ?? (s || "-");
}

function formatDateTimeBR(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

function moneyBR(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return String(v ?? "-");
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}


function statusTag(status?: string) {
  const s = String(status ?? "");
  if (s === "CONFIRMED") return <Tag color="green">{saleStatusLabel(s)}</Tag>;
  if (s === "DRAFT") return <Tag color="gold">{saleStatusLabel(s)}</Tag>;
  if (s === "CANCELED") return <Tag color="red">{saleStatusLabel(s)}</Tag>;
  return <Tag>{saleStatusLabel(s)}</Tag>;
}

function paymentTag(p?: string) {
  const s = String(p ?? "");
  if (s === "PIX") return <Tag color="blue">{paymentLabel(s)}</Tag>;
  if (s === "CASH") return <Tag color="green">{paymentLabel(s)}</Tag>;
  if (s === "CARD") return <Tag color="purple">{paymentLabel(s)}</Tag>;
  if (s === "PROMISSORY") return <Tag color="orange">{paymentLabel(s)}</Tag>;
  return <Tag>{paymentLabel(s)}</Tag>;
}

export default function Sales() {
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [statusValue, setStatusValue] = useState<(typeof STATUS_OPTIONS)[number]>("DRAFT");
  const [search, setSearch] = useState("");

  const [form] = Form.useForm<SaleCreate>();

  const clientsQ = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const productsQ = useQuery({ queryKey: ["products"], queryFn: listProducts });

  const salesQ = useQuery({
    queryKey: ["sales"],
    queryFn: listSales,
  });

  const clientMap = useMemo(() => {
    const m = new Map<number, string>();
    (clientsQ.data ?? []).forEach((c: Client) => m.set(c.id, c.name));
    return m;
  }, [clientsQ.data]);

  const productMap = useMemo(() => {
    const m = new Map<number, string>();
    (productsQ.data ?? []).forEach((p: Product) => m.set(p.id, `${p.brand} ${p.model} (${p.year})`));
    return m;
  }, [productsQ.data]);

  const productsInStock = useMemo(() => {
    return (productsQ.data ?? []).filter((p) => String(p.status) === "IN_STOCK");
  }, [productsQ.data]);

  const salesList: AnySale[] = useMemo(() => {
    const data = salesQ.data as any;
    if (Array.isArray(data)) return data;

    if (data && typeof data === "object") {
      const arr = Object.values(data).find((v) => Array.isArray(v));
      if (Array.isArray(arr)) return arr as AnySale[];
    }
    return [];
  }, [salesQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return salesList;
    return salesList.filter((s) => JSON.stringify(s).toLowerCase().includes(q));
  }, [salesList, search]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const confirmed = filtered.filter((s) => s.status === "CONFIRMED").length;
    const draft = filtered.filter((s) => s.status === "DRAFT").length;
    const sumTotal = filtered.reduce((acc, s) => acc + (Number(s.total ?? 0) || 0), 0);
    return { total, confirmed, draft, sumTotal };
  }, [filtered]);

  const createMut = useMutation({
    mutationFn: (payload: SaleCreate) => createSale(payload),
    onSuccess: () => {
      message.success("Venda criada!");
      qc.invalidateQueries({ queryKey: ["sales"] });
      setOpen(false);
      form.resetFields();
    },
    onError: (e: any) => message.error(e?.response?.data?.detail ?? "Erro ao criar venda"),
  });

  const statusMut = useMutation({
    mutationFn: (payload: { saleId: number; status: (typeof STATUS_OPTIONS)[number] }) =>
      updateSaleStatus(payload.saleId, payload.status),
    onSuccess: () => {
      message.success("Status atualizado!");
      qc.invalidateQueries({ queryKey: ["sales"] });
      setStatusOpen(false);
      setSelectedSaleId(null);
    },
    onError: (e: any) => message.error(e?.response?.data?.detail ?? "Erro ao atualizar status"),
  });

  const columns: ColumnsType<AnySale> = [
    {
      title: "Cliente",
      key: "client_name",
      width: 260,
      render: (_, row) => {
        const id = row.client_id;
        if (!id) return "-";
        return clientMap.get(id) ?? `#${id}`;
      },
    },
    {
      title: "Produto",
      key: "product_name",
      width: 360,
      render: (_, row) => {
        const id = row.product_id;
        if (!id) return "-";
        return productMap.get(id) ?? `#${id}`;
      },
    },
    {
      title: "Total",
      dataIndex: "total",
      width: 160,
      align: "right",
      render: (v) => <b>{moneyBR(v)}</b>,
    },
    {
      title: "Criado em",
      dataIndex: "created_at",
      width: 190,
      render: (v) => formatDateTimeBR(v),
    },
    {
      title: "Pagamento",
      dataIndex: "payment_type",
      width: 170,
      render: (v) => paymentTag(String(v ?? "")),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 150,
      render: (v) => statusTag(String(v ?? "")),
    },
    {
      title: "Ações",
      key: "actions",
      width: 170,
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            onClick={() => {
              setSelectedSaleId(row.id);
              const st = (row.status ?? "DRAFT") as any;
              setStatusValue((STATUS_OPTIONS as readonly string[]).includes(st) ? st : "DRAFT");
              setStatusOpen(true);
            }}
          >
            Status
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 12 }}>
      {/* RESUMO */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} md={6}>
          <Card>
            <Statistic title="Vendas (filtro)" value={summary.total} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <Statistic title="Confirmadas" value={summary.confirmed} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <Statistic title="Rascunho" value={summary.draft} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <Statistic title="Soma do total" value={moneyBR(summary.sumTotal)} />
          </Card>
        </Col>
      </Row>

      <Card
        title="Vendas"
        extra={
          <Space>
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 280 }}
              allowClear
            />
            <Button
              type="primary"
              onClick={() => {
                form.setFieldsValue({
                  discount: 0,
                  entry_amount: 0,
                  installments_count: 1,
                  payment_type: "CASH",
                  first_due_date: new Date().toISOString().slice(0, 10),
                } as any);
                setOpen(true);
              }}
            >
              Nova venda
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={salesQ.isLoading}
          dataSource={filtered}
          columns={columns}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal
        title="Nova venda"
        open={open}
        centered={false}
        style={{ top: 16 }}
        destroyOnClose
        onCancel={() => {
          setOpen(false);
          form.resetFields();
        }}
        okText="Criar"
        confirmLoading={createMut.isPending}
        onOk={async () => {
          const values = await form.validateFields();
          createMut.mutate({
            ...values,
            client_id: Number(values.client_id),
            user_id: Number(values.user_id),
            product_id: Number(values.product_id),
            total: Number(values.total),
            discount: Number(values.discount ?? 0),
            entry_amount: Number(values.entry_amount ?? 0),
            installments_count: Number(values.installments_count),
          });
        }}
      >
        <Form form={form} layout="vertical">
          <Divider orientation="left" style={{ marginTop: 0 }}>
            Dados principais
          </Divider>

          <Form.Item name="client_id" label="Cliente" rules={[{ required: true }]}>
            <Select
              loading={clientsQ.isLoading}
              showSearch
              optionFilterProp="label"
              placeholder="Selecione o cliente"
              options={(clientsQ.data ?? []).map((c) => ({
                value: c.id,
                label: `${c.name} (#${c.id}) • ${c.phone}`,
              }))}
            />
          </Form.Item>

          <Form.Item name="product_id" label="Produto (em estoque)" rules={[{ required: true }]}>
            <Select
              loading={productsQ.isLoading}
              showSearch
              optionFilterProp="label"
              placeholder="Selecione o produto"
              options={productsInStock.map((p) => ({
                value: p.id,
                label: `${p.brand} ${p.model} (${p.year}) • ${p.plate ?? "sem placa"} • ${moneyBR(p.sale_price)}`,
              }))}
            />
          </Form.Item>

          <Form.Item name="user_id" label="Funcionário (user_id)" rules={[{ required: true }]}>
            <InputNumber controls={false} min={1} style={{ width: "100%" }} placeholder="Ex: 1" />
          </Form.Item>

          <Divider orientation="left">Valores</Divider>

          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name="total" label="Total" rules={[{ required: true }]}>
                <InputNumber controls={false} min={0} style={{ width: "100%" }} addonBefore="R$" placeholder="0,00" />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item name="discount" label="Desconto">
                <InputNumber controls={false} min={0} style={{ width: "100%" }} addonBefore="R$" placeholder="0,00" />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item name="entry_amount" label="Entrada">
                <InputNumber controls={false} min={0} style={{ width: "100%" }} addonBefore="R$" placeholder="0,00" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Pagamento</Divider>

          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name="payment_type" label="Tipo de pagamento" rules={[{ required: true }]}>
                <Select
                  placeholder="Selecione"
                  options={PAYMENT_TYPES.map((p) => ({
                    value: p,
                    label: paymentLabel(p),
                  }))}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item name="installments_count" label="Qtd. parcelas" rules={[{ required: true }]}>
                <InputNumber controls={false} min={1} max={60} style={{ width: "100%" }} />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item name="first_due_date" label="1º vencimento" rules={[{ required: true }]}>
                <Input placeholder="2026-02-04" />
              </Form.Item>
            </Col>
          </Row>

          {!productsQ.isLoading && productsInStock.length === 0 && (
            <div style={{ marginTop: 6, color: "#d46b08" }}>
              Não há produtos com status <b>IN_STOCK</b>.
            </div>
          )}
        </Form>
      </Modal>


      <Modal
        title={selectedSaleId ? `Mudar status da venda #${selectedSaleId}` : "Mudar status"}
        open={statusOpen}
        onCancel={() => {
          setStatusOpen(false);
          setSelectedSaleId(null);
        }}
        okText="Salvar"
        confirmLoading={statusMut.isPending}
        onOk={() => {
          if (!selectedSaleId) return;
          statusMut.mutate({ saleId: selectedSaleId, status: statusValue });
        }}
      >
        <Select
          style={{ width: "100%" }}
          value={statusValue}
          onChange={(v) => setStatusValue(v)}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: SALE_STATUS_LABEL[s] ?? s }))}
        />
      </Modal>
    </div>
  );
}
