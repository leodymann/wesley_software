import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createFinance,
  getFinance,
  listFinance,
  payFinance,
  updateFinance,
} from "../services/finance";
import type { Finance, FinanceCreate, FinanceUpdate } from "../services/finance";

const STATUS_OPTIONS = ["PENDING", "PAID", "CANCELED"] as const;

function formatDateBR(v?: string) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("pt-BR");
}

type AnyFinance = Finance;

export default function Finance() {
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [openUpsert, setOpenUpsert] = useState(false);
  const [openPay, setOpenPay] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [form] = Form.useForm<
    (FinanceCreate & { due_date: dayjs.Dayjs }) | (FinanceUpdate & { due_date?: dayjs.Dayjs })
  >();

  const financeQ = useQuery({
    queryKey: ["finance"],
    queryFn: listFinance,
  });

  const list = useMemo(() => financeQ.data ?? [], [financeQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((f) => JSON.stringify(f).toLowerCase().includes(q));
  }, [list, search]);

  const createMut = useMutation({
    mutationFn: (payload: FinanceCreate) => createFinance(payload),
    onSuccess: () => {
      message.success("Conta criada!");
      qc.invalidateQueries({ queryKey: ["finance"] });
      setOpenUpsert(false);
      form.resetFields();
      setEditingId(null);
    },
    onError: (e: any) => message.error(e?.response?.data?.detail ?? "Erro ao criar conta"),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: number; data: FinanceUpdate }) => updateFinance(payload.id, payload.data),
    onSuccess: () => {
      message.success("Conta atualizada!");
      qc.invalidateQueries({ queryKey: ["finance"] });
      setOpenUpsert(false);
      form.resetFields();
      setEditingId(null);
    },
    onError: (e: any) => message.error(e?.response?.data?.detail ?? "Erro ao atualizar conta"),
  });

  const payMut = useMutation({
    mutationFn: (id: number) => payFinance(id),
    onSuccess: () => {
      message.success("Marcado como pago!");
      qc.invalidateQueries({ queryKey: ["finance"] });
      setOpenPay(false);
      setEditingId(null);
    },
    onError: (e: any) => message.error(e?.response?.data?.detail ?? "Erro ao pagar"),
  });

  async function openCreate() {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({
      status: "PENDING",
      due_date: dayjs(),
      wpp_tries: 0,
    } as any);
    setOpenUpsert(true);
  }

  async function openEdit(id: number) {
    setEditingId(id);
    setOpenUpsert(true);
    setLoadingDetails(true);
    try {
      const f = await getFinance(id);
      form.setFieldsValue({
        company: f.company,
        amount: Number(f.amount),
        due_date: f.due_date ? dayjs(f.due_date) : undefined,
        status: f.status,
        description: f.description ?? "",
        notes: f.notes ?? "",
      } as any);
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "Erro ao carregar");
      setOpenUpsert(false);
      setEditingId(null);
    } finally {
      setLoadingDetails(false);
    }
  }

  const columns: ColumnsType<AnyFinance> = [
    { title: "ID", dataIndex: "id", width: 90 },
    { title: "Empresa", dataIndex: "company", width: 200, render: (v) => v ?? "-" },
    { title: "Valor", dataIndex: "amount", width: 140, render: (v) => String(v ?? "-") },
    { title: "Vencimento", dataIndex: "due_date", width: 140, render: (v) => formatDateBR(v) },
    {
      title: "Status",
      dataIndex: "status",
      width: 120,
      render: (v) => <Tag>{String(v ?? "-")}</Tag>,
    },
    { title: "Descrição", dataIndex: "description", render: (v) => v ?? "-" },
    {
      title: "WhatsApp",
      key: "wpp",
      width: 140,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span>
            <b>{row.wpp_status ?? "-"}</b>
          </span>
          <span style={{ color: "#888" }}>tries: {row.wpp_tries ?? 0}</span>
        </Space>
      ),
    },
    {
      title: "Ações",
      key: "actions",
      width: 240,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => openEdit(row.id)}>
            Editar
          </Button>
          <Button
            size="small"
            type="primary"
            disabled={row.status !== "PENDING"}
            onClick={() => {
              setEditingId(row.id);
              setOpenPay(true);
            }}
          >
            Pagar
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Financeiro"
      extra={
        <Space>
          <Input
            placeholder="Buscar (JSON)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />
          <Button type="primary" onClick={openCreate}>
            Nova conta
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        loading={financeQ.isLoading}
        dataSource={filtered}
        columns={columns}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1200 }}
      />

      <Modal
        title={editingId ? `Editar conta #${editingId}` : "Nova conta"}
        open={openUpsert}
        onCancel={() => {
          setOpenUpsert(false);
          setEditingId(null);
          form.resetFields();
        }}
        okText={editingId ? "Salvar" : "Criar"}
        confirmLoading={createMut.isPending || updateMut.isPending || loadingDetails}
        onOk={async () => {
          const v = await form.validateFields();

          const payloadCommon = {
            company: String(v.company ?? "").trim(),
            amount: Number(v.amount),
            due_date: v.due_date ? (v.due_date as dayjs.Dayjs).format("YYYY-MM-DD") : undefined,
            status: v.status as any,
            description: v.description ? String(v.description) : undefined,
            notes: v.notes ? String(v.notes) : undefined,
          };

          if (!payloadCommon.company) return message.error("Empresa é obrigatória.");
          if (!Number.isFinite(payloadCommon.amount)) return message.error("Valor inválido.");
          if (!payloadCommon.due_date) return message.error("Vencimento é obrigatório.");

          if (editingId) {
            const upd: FinanceUpdate = {
              company: payloadCommon.company,
              amount: payloadCommon.amount,
              due_date: payloadCommon.due_date,
              status: payloadCommon.status,
              description: payloadCommon.description,
              notes: payloadCommon.notes,
            };
            updateMut.mutate({ id: editingId, data: upd });
          } else {
            const cre: FinanceCreate = {
              company: payloadCommon.company,
              amount: payloadCommon.amount,
              due_date: payloadCommon.due_date!,
              status: payloadCommon.status ?? "PENDING",
              description: payloadCommon.description,
              notes: payloadCommon.notes,
            };
            createMut.mutate(cre);
          }
        }}
      >
        <Form form={form} layout="vertical" disabled={loadingDetails}>
          <Form.Item name="company" label="Empresa" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Space style={{ display: "flex" }} size={12}>
            <Form.Item name="amount" label="Valor" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item name="due_date" label="Vencimento" rules={[{ required: true }]} style={{ flex: 1 }}>
              <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
            </Form.Item>

            <Form.Item name="status" label="Status" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))} />
            </Form.Item>
          </Space>

          <Form.Item name="description" label="Descrição">
            <Input />
          </Form.Item>

          <Form.Item name="notes" label="Observações">
            <Input.TextArea rows={3} />
          </Form.Item>

        </Form>
      </Modal>

      <Modal
        title={editingId ? `Marcar como pago #${editingId}` : "Marcar como pago"}
        open={openPay}
        onCancel={() => {
          setOpenPay(false);
          setEditingId(null);
        }}
        okText="Confirmar"
        confirmLoading={payMut.isPending}
        onOk={() => {
          if (!editingId) return;
          payMut.mutate(editingId);
        }}
      >
        <p style={{ margin: 0 }}>
          Isso chama <b>POST /finance/{`{id}`}/pay</b> e marca o status como <b>PAID</b>.
        </p>
      </Modal>
    </Card>
  );
}
