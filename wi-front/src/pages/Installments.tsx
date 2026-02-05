import {
  Button,
  Card,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  message,
  Row,
  Col,
  Descriptions,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listInstallments, payInstallment } from "../services/installments";
import type { Installment } from "../services/installments";

import { listPromissories } from "../services/promissories";
import type { Promissory } from "../services/promissories";

import { listClients } from "../services/clients";
import type { Client } from "../services/clients";

import { listProducts } from "../services/products";
import type { Product } from "../services/products";

const STATUS_COLOR: Record<string, any> = {
  // installment
  PENDING: "orange",
  PAID: "green",
  CANCELED: "red",

  // promissory
  DRAFT: "default",
  ISSUED: "blue",
};

const PROMISSORY_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  ISSUED: "Emitida",
  PAID: "Quitada",
  CANCELED: "Cancelada",
};

const INSTALLMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  PAID: "Paga",
  CANCELED: "Cancelada",
};

function labelFromMap(v: unknown, map: Record<string, string>, fallback = "-") {
  const k = String(v ?? "");
  return map[k] ?? (k ? k : fallback);
}

function onlyDigits(v: string) {
  return (v ?? "").replace(/\D/g, "");
}

function formatPhoneBR(raw: string) {
  const d = onlyDigits(raw).slice(0, 11);
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);

  if (!d) return "-";
  if (d.length <= 2) return `(${ddd}`;

  // 10 dígitos total => 8 no número (fixo)
  if (d.length === 10) {
    const p1 = rest.slice(0, 4);
    const p2 = rest.slice(4, 8);
    return `(${ddd}) ${p1}-${p2}`;
  }

  // 11 dígitos total => 9 no número (celular)
  const p1 = rest.slice(0, 5);
  const p2 = rest.slice(5, 9);
  return `(${ddd}) ${p1}${p2 ? "-" + p2 : ""}`;
}

function formatDateBR(v?: string) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("pt-BR");
}

function formatDateTimeBR(v?: string) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("pt-BR");
}

function moneyBR(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return String(v ?? "-");
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type GroupRow = {
  promissory_id: number;

  // agregados
  total_installments: number;
  pending: number;
  paid: number;
  canceled: number;
  next_due_date: string | null;
  total_amount_sum: number;
  paid_amount_sum: number;

  // itens
  items: Installment[];

  client_id?: number;
  product_id?: number;
  promissory_status?: string;
};

export default function Installments() {
  const qc = useQueryClient();

  const [search, setSearch] = useState("");

  const [openGroup, setOpenGroup] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupRow | null>(null);

  const [openPay, setOpenPay] = useState(false);
  const [selectedInst, setSelectedInst] = useState<Installment | null>(null);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [note, setNote] = useState<string>("");

  // base
  const instQ = useQuery({ queryKey: ["installments"], queryFn: listInstallments });

  const promQ = useQuery({ queryKey: ["promissories"], queryFn: listPromissories });
  const clientsQ = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const productsQ = useQuery({ queryKey: ["products"], queryFn: listProducts });

  const list = useMemo(() => instQ.data ?? [], [instQ.data]);

  const promMap = useMemo(() => {
    const m = new Map<number, Promissory>();
    (promQ.data ?? []).forEach((p) => m.set(Number((p as any).id), p));
    return m;
  }, [promQ.data]);

  const clientMap = useMemo(() => {
    const m = new Map<number, Client>();
    (clientsQ.data ?? []).forEach((c) => m.set(Number((c as any).id), c));
    return m;
  }, [clientsQ.data]);

  const productMap = useMemo(() => {
    const m = new Map<number, Product>();
    (productsQ.data ?? []).forEach((p) => m.set(Number((p as any).id), p));
    return m;
  }, [productsQ.data]);

  // 🔥 agrupa por promissory_id
  const groups = useMemo<GroupRow[]>(() => {
    const map = new Map<number, GroupRow>();

    for (const it of list) {
      const pid = Number((it as any).promissory_id);
      if (!pid) continue;

      if (!map.has(pid)) {
        map.set(pid, {
          promissory_id: pid,
          total_installments: 0,
          pending: 0,
          paid: 0,
          canceled: 0,
          next_due_date: null,
          total_amount_sum: 0,
          paid_amount_sum: 0,
          items: [],
        });
      }

      const g = map.get(pid)!;

      g.items.push(it);
      g.total_installments += 1;

      const status = String((it as any).status ?? "");
      if (status === "PENDING") g.pending += 1;
      else if (status === "PAID") g.paid += 1;
      else if (status === "CANCELED") g.canceled += 1;

      const amountN = Number((it as any).amount ?? 0);
      if (Number.isFinite(amountN)) g.total_amount_sum += amountN;

      const paidN = Number((it as any).paid_amount ?? 0);
      if (Number.isFinite(paidN)) g.paid_amount_sum += paidN;

      // próxima parcela pendente mais próxima
      if (status === "PENDING" && (it as any).due_date) {
        const due = String((it as any).due_date);
        if (!g.next_due_date) g.next_due_date = due;
        else {
          const cur = new Date(g.next_due_date).getTime();
          const nxt = new Date(due).getTime();
          if (!Number.isNaN(cur) && !Number.isNaN(nxt) && nxt < cur) g.next_due_date = due;
        }
      }
    }

    // enrich com dados da promissória (client_id, product_id, status)
    for (const g of map.values()) {
      const prom = promMap.get(g.promissory_id);
      if (prom) {
        g.client_id = (prom as any).client_id ?? undefined;
        g.product_id = (prom as any).product_id ?? undefined;
        g.promissory_status = (prom as any).status ?? undefined;
      }
    }

    // ordena por próximo vencimento (pendente) e depois pelo id
    return Array.from(map.values()).sort((a, b) => {
      const ad = a.next_due_date ? new Date(a.next_due_date).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.next_due_date ? new Date(b.next_due_date).getTime() : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return a.promissory_id - b.promissory_id;
    });
  }, [list, promMap]);

  // busca legível (cliente/produto/telefone/placa etc)
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;

    return groups.filter((g) => {
      const c = g.client_id ? clientMap.get(g.client_id) : undefined;
      const p = g.product_id ? productMap.get(g.product_id) : undefined;

      const hay = [
        String(g.promissory_id),
        String(g.promissory_status ?? ""),
        labelFromMap(g.promissory_status, PROMISSORY_STATUS_LABEL, ""),
        c?.name ?? "",
        c?.phone ?? "",
        c?.cpf ?? "",
        p ? `${(p as any).brand} ${(p as any).model} ${(p as any).year} ${(p as any).plate ?? ""} ${(p as any).chassi ?? ""}` : "",
      ]
        .join(" | ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [groups, search, clientMap, productMap]);

  const payMut = useMutation({
    mutationFn: (payload: { id: number; paid_amount: number; note?: string }) =>
      payInstallment(payload.id, payload.paid_amount, payload.note),
    onSuccess: () => {
      message.success("Parcela paga!");
      qc.invalidateQueries({ queryKey: ["installments"] });

      setOpenPay(false);
      setSelectedInst(null);
      setPaidAmount(0);
      setNote("");
    },
    onError: (e: any) => message.error(e?.response?.data?.detail ?? "Erro ao pagar parcela"),
  });

  const groupColumns: ColumnsType<GroupRow> = [
    {
      title: "Contrato",
      key: "contract",
      width: 360,
      render: (_, g) => {
        const c = g.client_id ? clientMap.get(g.client_id) : undefined;
        const p = g.product_id ? productMap.get(g.product_id) : undefined;

        return (
          <div style={{ lineHeight: 1.25 }}>
            <div style={{ fontWeight: 700 }}>
              {c?.name ?? (g.client_id ? `Cliente #${g.client_id}` : "Cliente -")}
            </div>
            <div style={{ opacity: 0.85 }}>
              {c?.phone ? formatPhoneBR((c as any).phone) : "-"}
              {" • "}
              {p
                ? `${(p as any).brand} ${(p as any).model} (${(p as any).year})`
                : g.product_id
                  ? `Produto #${g.product_id}`
                  : "Produto -"}
            </div>
            <div style={{ marginTop: 6 }}>
              <Tag color={STATUS_COLOR[String(g.promissory_status ?? "DRAFT")]}>
                {labelFromMap(g.promissory_status ?? "DRAFT", PROMISSORY_STATUS_LABEL)}
              </Tag>
              <Tag>Prom #{g.promissory_id}</Tag>
            </div>
          </div>
        );
      },
    },
    {
      title: "Resumo",
      key: "summary",
      width: 260,
      render: (_, g) => (
        <Space wrap>
          <Tag>Total: {g.total_installments}</Tag>
          <Tag color={STATUS_COLOR.PENDING}>Pend: {g.pending}</Tag>
          <Tag color={STATUS_COLOR.PAID}>Pagas: {g.paid}</Tag>
          <Tag color={STATUS_COLOR.CANCELED}>Canc: {g.canceled}</Tag>
        </Space>
      ),
    },
    {
      title: "Próx. venc.",
      dataIndex: "next_due_date",
      width: 140,
      render: (v) => (v ? formatDateBR(String(v)) : "-"),
    },
    {
      title: "Total",
      dataIndex: "total_amount_sum",
      width: 140,
      align: "right",
      render: (v) => <b>{moneyBR(v)}</b>,
    },
    {
      title: "Pago",
      dataIndex: "paid_amount_sum",
      width: 140,
      align: "right",
      render: (v) => moneyBR(v),
    },
    {
      title: "Ações",
      key: "actions",
      width: 130,
      render: (_, g) => (
        <Button
          size="small"
          type="primary"
          onClick={() => {
            setSelectedGroup(g);
            setOpenGroup(true);
          }}
        >
          Ver parcelas
        </Button>
      ),
    },
  ];

  const installmentColumns: ColumnsType<Installment> = [
    { title: "Nº", dataIndex: "number", width: 70 },
    { title: "Vencimento", dataIndex: "due_date", width: 130, render: (v) => formatDateBR(String(v)) },
    { title: "Valor", dataIndex: "amount", width: 140, align: "right", render: (v) => moneyBR(v) },
    {
      title: "Status",
      dataIndex: "status",
      width: 140,
      render: (v) => (
        <Tag color={STATUS_COLOR[String(v)]}>
          {labelFromMap(v, INSTALLMENT_STATUS_LABEL)}
        </Tag>
      ),
    },
    { title: "Pago em", dataIndex: "paid_at", width: 170, render: (v) => formatDateTimeBR(String(v ?? "")) },
    { title: "Pago", dataIndex: "paid_amount", width: 140, align: "right", render: (v) => moneyBR(v) },
    {
      title: "Ações",
      key: "actions",
      width: 120,
      render: (_, row: any) => (
        <Button
          size="small"
          type="primary"
          disabled={String(row.status) !== "PENDING"}
          onClick={() => {
            setSelectedInst(row);
            setPaidAmount(Number(row.amount ?? 0));
            setNote("");
            setOpenPay(true);
          }}
        >
          Pagar
        </Button>
      ),
    },
  ];

  const headerClient = selectedGroup?.client_id ? clientMap.get(selectedGroup.client_id) : undefined;
  const headerProduct = selectedGroup?.product_id ? productMap.get(selectedGroup.product_id) : undefined;

  return (
    <Card
      title="Parcelas (por contrato)"
      extra={
        <Input
          placeholder="Buscar por cliente, telefone, produto, promissória..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 360 }}
          allowClear
        />
      }
    >
      <Table
        rowKey={(row) => String(row.promissory_id)}
        loading={instQ.isLoading || promQ.isLoading || clientsQ.isLoading || productsQ.isLoading}
        dataSource={filteredGroups}
        columns={groupColumns}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1080 }}
      />

      <Modal
        open={openGroup}
        width={1000}
        centered={false}
        style={{ top: 16 }}
        title={selectedGroup ? `Contrato — Promissória #${selectedGroup.promissory_id}` : "Contrato"}
        onCancel={() => {
          setOpenGroup(false);
          setSelectedGroup(null);
        }}
        footer={null}
        destroyOnClose
      >
        {selectedGroup && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="Cliente" span={2}>
                <b>{headerClient?.name ?? (selectedGroup.client_id ? `Cliente #${selectedGroup.client_id}` : "-")}</b>
              </Descriptions.Item>
              <Descriptions.Item label="Telefone">
                {headerClient?.phone ? formatPhoneBR((headerClient as any).phone) : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Status do contrato">
                <Tag color={STATUS_COLOR[String(selectedGroup.promissory_status ?? "DRAFT")]}>
                  {labelFromMap(selectedGroup.promissory_status ?? "DRAFT", PROMISSORY_STATUS_LABEL)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Produto" span={2}>
                {headerProduct
                  ? `${(headerProduct as any).brand} ${(headerProduct as any).model} (${(headerProduct as any).year}) • Placa: ${
                      (headerProduct as any).plate ?? "—"
                    }`
                  : selectedGroup.product_id
                    ? `Produto #${selectedGroup.product_id}`
                    : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Próximo vencimento">
                {selectedGroup.next_due_date ? formatDateBR(selectedGroup.next_due_date) : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Resumo">
                <Space wrap>
                  <Tag>Total: {selectedGroup.total_installments}</Tag>
                  <Tag color={STATUS_COLOR.PENDING}>Pend: {selectedGroup.pending}</Tag>
                  <Tag color={STATUS_COLOR.PAID}>Pagas: {selectedGroup.paid}</Tag>
                  <Tag color={STATUS_COLOR.CANCELED}>Canc: {selectedGroup.canceled}</Tag>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Total (parcelas)">{moneyBR(selectedGroup.total_amount_sum)}</Descriptions.Item>
              <Descriptions.Item label="Pago">{moneyBR(selectedGroup.paid_amount_sum)}</Descriptions.Item>
            </Descriptions>

            <Table
              rowKey={(row: any) => String(row.id)}
              dataSource={[...selectedGroup.items].sort((a: any, b: any) => Number(a.number) - Number(b.number))}
              columns={installmentColumns}
              pagination={{ pageSize: 8 }}
              scroll={{ x: 980 }}
            />
          </>
        )}
      </Modal>

      <Modal
        open={openPay}
        centered={false}
        style={{ top: 16 }}
        title={selectedInst ? `Pagar parcela #${(selectedInst as any).id}` : "Pagar parcela"}
        onCancel={() => {
          setOpenPay(false);
          setSelectedInst(null);
        }}
        okText="Confirmar pagamento"
        confirmLoading={payMut.isPending}
        destroyOnClose
        onOk={() => {
          if (!selectedInst) return;
          const id = Number((selectedInst as any).id);
          if (!id) return message.error("Parcela sem ID.");
          if (!paidAmount || paidAmount <= 0) return message.error("Informe um valor pago válido.");

          payMut.mutate({ id, paid_amount: paidAmount, note: note || undefined });
        }}
      >
        {selectedInst && (
          <>
            <Row gutter={12}>
              <Col span={12}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Promissória</div>
                <div>{String((selectedInst as any).promissory_id ?? "-")}</div>
              </Col>
              <Col span={12}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Parcela</div>
                <div>#{String((selectedInst as any).number ?? "-")}</div>
              </Col>
            </Row>

            <Row gutter={12} style={{ marginTop: 10 }}>
              <Col span={12}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Vencimento</div>
                <div>{formatDateBR(String((selectedInst as any).due_date ?? ""))}</div>
              </Col>
              <Col span={12}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Valor</div>
                <div>{moneyBR((selectedInst as any).amount)}</div>
              </Col>
            </Row>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Valor pago</div>
              <InputNumber
                min={0}
                style={{ width: "100%" }}
                value={paidAmount}
                controls={false}
                onChange={(v) => setPaidAmount(Number(v ?? 0))}
                placeholder="Ex: 500.00"
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Observação (opcional)</div>
              <Input.TextArea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: pago no PIX"
              />
            </div>
          </>
        )}
      </Modal>
    </Card>
  );
}
