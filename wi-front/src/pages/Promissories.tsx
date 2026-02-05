import {
  Button,
  Card,
  Modal,
  Space,
  Table,
  Tag,
  message,
  Descriptions,
  Divider,
  Row,
  Col,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listPromissories, issuePromissory, cancelPromissory } from "../services/promissories";
import type { Promissory } from "../services/promissories";

import { listClients } from "../services/clients";
import type { Client } from "../services/clients";

import { listProducts } from "../services/products";
import type { Product } from "../services/products";

const STATUS_COLOR: Record<string, any> = {
  DRAFT: "default",
  ISSUED: "blue",
  CANCELED: "red",
  PAID: "green",
};

const PROM_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  ISSUED: "Emitida",
  CANCELED: "Cancelada",
  PAID: "Paga",
};

function statusLabel(status?: string | null) {
  const s = String(status || "");
  return PROM_STATUS_LABEL[s] || (s || "-");
}

function onlyDigits(v: string) {
  return String(v || "").replace(/\D/g, "");
}

function formatCPF(raw: string) {
  const d = onlyDigits(raw).slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);

  if (!d) return "-";
  if (d.length <= 3) return p1;
  if (d.length <= 6) return `${p1}.${p2}`;
  if (d.length <= 9) return `${p1}.${p2}.${p3}`;
  return `${p1}.${p2}.${p3}-${p4}`;
}

function formatPhoneBR(raw: string) {
  const d = onlyDigits(raw).slice(0, 11);
  if (!d) return "-";

  const ddd = d.slice(0, 2);
  const rest = d.slice(2);

  if (d.length <= 2) return `(${ddd}`;

  // 10 dígitos total
  if (d.length <= 10) {
    const p1 = rest.slice(0, 4);
    const p2 = rest.slice(4, 8);
    return `(${ddd}) ${p1}${p2 ? "-" + p2 : ""}`;
  }

  // 11 dígitos total
  const p1 = rest.slice(0, 5);
  const p2 = rest.slice(5, 9);
  return `(${ddd}) ${p1}${p2 ? "-" + p2 : ""}`;
}

function formatDateTimeBR(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("pt-BR");
}

function moneyBR(v: unknown) {
  const s = String(v ?? "").replace(",", ".");
  const n = typeof v === "number" ? v : Number(s);
  if (!Number.isFinite(n)) return String(v ?? "-");
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Promissories() {
  const qc = useQueryClient();

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<Promissory | null>(null);
  const [confirmType, setConfirmType] = useState<"ISSUE" | "CANCEL" | null>(null);

  const promQ = useQuery({ queryKey: ["promissories"], queryFn: listPromissories });
  const clientsQ = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const productsQ = useQuery({ queryKey: ["products"], queryFn: listProducts });

  const clientMap = useMemo(() => {
    const m = new Map<number, Client>();
    (clientsQ.data || []).forEach((c) => m.set(Number(c.id), c));
    return m;
  }, [clientsQ.data]);

  const productMap = useMemo(() => {
    const m = new Map<number, Product>();
    (productsQ.data || []).forEach((p) => m.set(Number(p.id), p));
    return m;
  }, [productsQ.data]);

  const list = useMemo(() => promQ.data || [], [promQ.data]);

  const issueMut = useMutation({
    mutationFn: (id: number) => issuePromissory(id),
    onSuccess: () => {
      message.success("Promissória emitida!");
      qc.invalidateQueries({ queryKey: ["promissories"] });
      setConfirmType(null);
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || "Erro ao emitir promissória"),
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => cancelPromissory(id),
    onSuccess: () => {
      message.success("Promissória cancelada!");
      qc.invalidateQueries({ queryKey: ["promissories"] });
      setConfirmType(null);
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || "Erro ao cancelar promissória"),
  });

  const columns: ColumnsType<Promissory> = [
    { title: "ID", dataIndex: "id", width: 90 },
    {
      title: "Cliente",
      key: "client_name",
      width: 280,
      render: (_, row) => {
        const cid = Number((row as any).client_id || 0);
        const c = cid ? clientMap.get(cid) : undefined;

        return (
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontWeight: 700 }}>{c?.name || (cid ? `Cliente #${cid}` : "-")}</div>
            <div style={{ opacity: 0.85, fontSize: 12 }}>{c?.phone ? formatPhoneBR(c.phone) : "-"}</div>
          </div>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 150,
      render: (v) => <Tag color={STATUS_COLOR[String(v)]}>{statusLabel(String(v || ""))}</Tag>,
    },
    {
      title: "Total",
      dataIndex: "total",
      width: 150,
      align: "right",
      render: (v) => <b>{moneyBR(v)}</b>,
    },
    {
      title: "Produto",
      key: "product_name",
      width: 360,
      render: (_, row) => {
        const pid = Number((row as any).product_id || 0);
        const p = pid ? productMap.get(pid) : undefined;

        if (p) return `${p.brand} ${p.model} (${p.year}) • ${p.plate || "sem placa"}`;
        return pid ? `Produto #${pid}` : "-";
      },
    },
    {
      title: "Ações",
      key: "actions",
      width: 140,
      render: (_, row) => (
        <Button
          size="small"
          onClick={() => {
            setSelected(row);
            setDetailsOpen(true);
          }}
        >
          Ver
        </Button>
      ),
    },
  ];

  const selClient = selected?.client_id ? clientMap.get(Number(selected.client_id)) : undefined;
  const selProduct = selected?.product_id ? productMap.get(Number(selected.product_id)) : undefined;

  const canIssue = selected?.status === "DRAFT";
  const canCancel = selected?.status !== "CANCELED" && selected?.status !== "PAID";

  const sectionCardStyle: React.CSSProperties = {
    borderRadius: 12,
    height: "100%",
    minHeight: 220,
  };

  return (
    <Card title="Promissórias">
      <Table
        rowKey="id"
        loading={promQ.isLoading || clientsQ.isLoading || productsQ.isLoading}
        dataSource={list}
        columns={columns}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1100 }}
      />

      <Modal
        title={selected ? `Contrato • Promissória #${selected.id}` : "Contrato"}
        open={detailsOpen}
        centered
        destroyOnClose
        width={1100}
        styles={{ body: { paddingTop: 8 } }}
        onCancel={() => {
          setDetailsOpen(false);
          setSelected(null);
        }}
        footer={
          selected ? (
            <Space style={{ width: "100%", justifyContent: "space-between" }}>
              <div style={{ opacity: 0.75 }}>
                <Tag color={STATUS_COLOR[String(selected.status)]}>{statusLabel(String(selected.status || ""))}</Tag>
                <Tag>
                  Total: <b>{moneyBR((selected as any).total)}</b>
                </Tag>
              </div>

              <Space>
                <Button
                  onClick={() => {
                    setDetailsOpen(false);
                    setSelected(null);
                  }}
                >
                  Fechar
                </Button>

                <Button type="primary" disabled={!canIssue} onClick={() => setConfirmType("ISSUE")}>
                  Emitir
                </Button>

                <Button danger disabled={!canCancel} onClick={() => setConfirmType("CANCEL")}>
                  Cancelar
                </Button>
              </Space>
            </Space>
          ) : null
        }
      >
        {selected && (
          <>
            <Row gutter={12} align="stretch">
              <Col xs={24} md={12}>
                <Card size="small" style={sectionCardStyle}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Cliente</div>
                  <Descriptions size="small" column={2} bordered>
                    <Descriptions.Item label="Nome" span={2}>
                      <b>{selClient?.name || (selected.client_id ? `Cliente #${selected.client_id}` : "-")}</b>
                    </Descriptions.Item>
                    <Descriptions.Item label="Telefone">
                      {selClient?.phone ? formatPhoneBR(selClient.phone) : "-"}
                    </Descriptions.Item>
                    <Descriptions.Item label="CPF">{selClient?.cpf ? formatCPF(selClient.cpf) : "-"}</Descriptions.Item>
                    <Descriptions.Item label="Endereço" span={2}>
                      {selClient?.address || "-"}
                    </Descriptions.Item>
                  </Descriptions>

                  {selClient?.notes ? (
                    <div style={{ marginTop: 10, opacity: 0.85 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Observações</div>
                      <div>{selClient.notes}</div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, opacity: 0.55 }}>Sem observações.</div>
                  )}
                </Card>
              </Col>

              <Col xs={24} md={12}>
                <Card size="small" style={sectionCardStyle}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Produto</div>
                  <Descriptions size="small" column={2} bordered>
                    <Descriptions.Item label="Nome" span={2}>
                      {selProduct
                        ? `${selProduct.brand} ${selProduct.model} (${selProduct.year})`
                        : selected.product_id
                          ? `Produto #${selected.product_id}`
                          : "-"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Placa">{selProduct?.plate || "—"}</Descriptions.Item>
                    <Descriptions.Item label="KM">{String(selProduct?.km ?? "—")}</Descriptions.Item>
                    <Descriptions.Item label="Cor">{selProduct?.color || "—"}</Descriptions.Item>
                    <Descriptions.Item label="Preço venda">
                      <b>{moneyBR(selProduct?.sale_price)}</b>
                    </Descriptions.Item>
                    <Descriptions.Item label="Preço custo">{moneyBR(selProduct?.cost_price)}</Descriptions.Item>
                  </Descriptions>

                  <div style={{ marginTop: 10, opacity: 0.55, fontSize: 12 }}>
                    Chassi: {selProduct?.chassi || "—"}
                  </div>
                </Card>
              </Col>
            </Row>

            <Divider style={{ margin: "14px 0" }} />

            <Row gutter={12} align="stretch">
              <Col xs={24} md={12}>
                <Card size="small" style={sectionCardStyle}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Contrato</div>
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label="Public ID">{selected.public_id || "-"}</Descriptions.Item>
                    <Descriptions.Item label="Status">
                      <Tag color={STATUS_COLOR[String(selected.status)]}>
                        {statusLabel(String(selected.status || ""))}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Emitida em">
                      {formatDateTimeBR((selected as any).issued_at)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Venda ID">{String((selected as any).sale_id ?? "—")}</Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>

              <Col xs={24} md={12}>
                <Card size="small" style={sectionCardStyle}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Valores</div>
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label="Total">
                      <b>{moneyBR((selected as any).total)}</b>
                    </Descriptions.Item>
                    <Descriptions.Item label="Entrada">{moneyBR((selected as any).entry_amount)}</Descriptions.Item>
                    <Descriptions.Item label="Em aberto">
                      {(() => {
                        const total = Number(String((selected as any).total ?? "").replace(",", "."));
                        const entry = Number(String((selected as any).entry_amount ?? "").replace(",", "."));
                        if (!Number.isFinite(total)) return "-";
                        const open = total - (Number.isFinite(entry) ? entry : 0);
                        return <b>{moneyBR(open)}</b>;
                      })()}
                    </Descriptions.Item>
                  </Descriptions>

                  <div style={{ marginTop: 10, opacity: 0.55, fontSize: 12 }}>
                    * “Em aberto” = Total - Entrada
                  </div>
                </Card>
              </Col>
            </Row>
          </>
        )}
      </Modal>

      <Modal
        open={!!confirmType}
        centered
        destroyOnClose
        onCancel={() => setConfirmType(null)}
        okText={confirmType === "ISSUE" ? "Emitir" : "Cancelar"}
        okButtonProps={{ danger: confirmType === "CANCEL" }}
        confirmLoading={issueMut.isPending || cancelMut.isPending}
        title={
          confirmType === "ISSUE"
            ? `Emitir promissória #${selected?.id}`
            : `Cancelar promissória #${selected?.id}`
        }
        onOk={() => {
          if (!selected) return;
          if (confirmType === "ISSUE") issueMut.mutate(selected.id);
          if (confirmType === "CANCEL") cancelMut.mutate(selected.id);
        }}
      >
        {selected && (
          <div style={{ lineHeight: 1.8 }}>
            <div>
              <b>Cliente:</b> {selClient?.name || `#${String(selected.client_id ?? "-")}`}
            </div>
            <div>
              <b>Telefone:</b> {selClient?.phone ? formatPhoneBR(selClient.phone) : "-"}
            </div>
            <div>
              <b>Produto:</b>{" "}
              {selProduct
                ? `${selProduct.brand} ${selProduct.model} (${selProduct.year})`
                : `#${String(selected.product_id ?? "-")}`}
            </div>
            <div>
              <b>Total:</b> {moneyBR((selected as any).total)}
            </div>
            <div>
              <b>Status atual:</b> {statusLabel(String(selected.status || "-"))}
            </div>

            {confirmType === "ISSUE" && (
              <div style={{ marginTop: 10, color: "#1677ff" }}>
                Ao emitir, a promissória passa para <b>Emitida</b>.
              </div>
            )}
            {confirmType === "CANCEL" && (
              <div style={{ marginTop: 10, color: "#cf1322" }}>
                Ao cancelar, a promissória passa para <b>Cancelada</b>.
              </div>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}
