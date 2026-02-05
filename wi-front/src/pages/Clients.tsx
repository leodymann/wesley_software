import { Button, Card, Form, Input, Modal, Space, Table, message, Row, Col, Divider } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, getClient, listClients, updateClient } from "../services/clients";
import type { Client, ClientCreate } from "../services/clients";

function onlyDigits(v: string) {
  return (v ?? "").replace(/\D/g, "");
}

function formatCPF(raw: string) {
  const d = onlyDigits(raw).slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);

  if (!d) return "";
  if (d.length <= 3) return p1;
  if (d.length <= 6) return `${p1}.${p2}`;
  if (d.length <= 9) return `${p1}.${p2}.${p3}`;
  return `${p1}.${p2}.${p3}-${p4}`;
}


function formatPhoneBR(raw: string) {
  const d = onlyDigits(raw).slice(0, 11);
  if (!d) return "";

  const ddd = d.slice(0, 2);
  const rest = d.slice(2);

  if (d.length <= 2) return `(${ddd}`;

  if (d.length <= 10) {
    const p1 = rest.slice(0, 4);
    const p2 = rest.slice(4, 8);
    return `(${ddd}) ${p1}${p2 ? "-" + p2 : ""}`;
  }

  const p1 = rest.slice(0, 5);
  const p2 = rest.slice(5, 9);
  return `(${ddd}) ${p1}${p2 ? "-" + p2 : ""}`;
}

export default function Clients() {
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [form] = Form.useForm<{
    name: string;
    phone: string;
    cpf: string;
    address: string;
    notes?: string;
  }>();

  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: listClients,
  });

  const createMut = useMutation({
    mutationFn: (payload: ClientCreate) => createClient(payload),
    onSuccess: () => {
      message.success("Cliente criado!");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
      form.resetFields();
    },
    onError: (e: any) => message.error(e?.response?.data?.detail ?? "Erro ao criar cliente"),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: number; data: ClientCreate }) => updateClient(payload.id, payload.data),
    onSuccess: () => {
      message.success("Cliente atualizado!");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
      setEditingId(null);
      form.resetFields();
    },
    onError: (e: any) => message.error(e?.response?.data?.detail ?? "Erro ao atualizar cliente"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];

    return (data ?? []).filter((c) =>
      [c.name, c.phone, c.cpf, c.address, c.notes].some((v) => (v ?? "").toLowerCase().includes(q))
    );
  }, [data, search]);

  async function openCreate() {
    setEditingId(null);
    form.resetFields();
    setOpen(true);
  }

  async function openEdit(id: number) {
    setEditingId(id);
    setOpen(true);
    setLoadingDetails(true);

    try {
      const c = await getClient(id);
      form.setFieldsValue({
        name: c.name ?? "",
        phone: formatPhoneBR(c.phone ?? ""),
        cpf: formatCPF(c.cpf ?? ""),
        address: c.address ?? "",
        notes: c.notes ?? "",
      });
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "Erro ao carregar cliente");
      setOpen(false);
      setEditingId(null);
    } finally {
      setLoadingDetails(false);
    }
  }

  const columns: ColumnsType<Client> = [
    { title: "ID", dataIndex: "id", width: 80 },
    { title: "Nome", dataIndex: "name" },
    {
      title: "Telefone",
      dataIndex: "phone",
      width: 190,
      render: (v) => formatPhoneBR(String(v ?? "")) || "-",
    },
    {
      title: "CPF",
      dataIndex: "cpf",
      width: 170,
      render: (v) => formatCPF(String(v ?? "")) || "-",
    },
    { title: "Endereço", dataIndex: "address", render: (v) => v ?? "-" },
    {
      title: "Ações",
      key: "actions",
      width: 160,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => openEdit(row.id)}>
            Editar
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Clientes"
      extra={
        <Space>
          <Input
            placeholder="Buscar por nome, telefone, cpf..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 320 }}
            allowClear
          />
          <Button type="primary" onClick={openCreate}>
            Novo cliente
          </Button>
        </Space>
      }
    >
      <Table rowKey="id" loading={isLoading} dataSource={filtered} columns={columns} pagination={{ pageSize: 10 }} />

      <Modal
        title={editingId ? `Editar cliente #${editingId}` : "Novo cliente"}
        open={open}
        centered={false}
        style={{ top: 16 }}
        destroyOnClose
        onCancel={() => {
          setOpen(false);
          setEditingId(null);
          form.resetFields();
        }}
        okText={editingId ? "Salvar" : "Criar"}
        confirmLoading={createMut.isPending || updateMut.isPending || loadingDetails}
        onOk={async () => {
          const values = await form.validateFields();

          const payload: ClientCreate = {
            name: values.name.trim(),
            phone: onlyDigits(values.phone),
            cpf: onlyDigits(values.cpf),
            address: values.address.trim(),
            notes: values.notes?.trim() || "",
          };

          if (payload.phone.length < 10 || payload.phone.length > 11) {
            return message.error("Telefone inválido. Use DDD + número (10 ou 11 dígitos).");
          }
          if (payload.cpf.length !== 11) {
            return message.error("CPF inválido. Deve ter 11 dígitos.");
          }

          if (editingId) updateMut.mutate({ id: editingId, data: payload });
          else createMut.mutate(payload);
        }}
      >
        <Form form={form} layout="vertical" disabled={loadingDetails} autoComplete="off">
          <Divider orientation="left" style={{ marginTop: 0 }}>
            Dados do cliente
          </Divider>

          <Row gutter={12}>
            <Col xs={24} md={14}>
              <Form.Item name="name" label="Nome completo" rules={[{ required: true, message: "Informe o nome" }]}>
                <Input placeholder="Ex: João da Silva" />
              </Form.Item>
            </Col>

            <Col xs={24} md={10}>
              <Form.Item
                name="phone"
                label="Telefone (WhatsApp)"
                rules={[
                  { required: true, message: "Informe o telefone" },
                  {
                    validator: async (_, v) => {
                      const d = onlyDigits(v || "");
                      if (d.length >= 10 && d.length <= 11) return Promise.resolve();
                      return Promise.reject(new Error("Use DDD + número (10 ou 11 dígitos)"));
                    },
                  },
                ]}
              >
                <Input
                  addonBefore="+55"
                  placeholder="(85) 99999-8888"
                  inputMode="numeric"
                  maxLength={16} // (99) 99999-9999
                  onChange={(e) => form.setFieldsValue({ phone: formatPhoneBR(e.target.value) })}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col xs={24} md={10}>
              <Form.Item
                name="cpf"
                label="CPF"
                rules={[
                  { required: true, message: "Informe o CPF" },
                  {
                    validator: async (_, v) => {
                      const d = onlyDigits(v || "");
                      if (d.length === 11) return Promise.resolve();
                      return Promise.reject(new Error("CPF deve ter 11 dígitos"));
                    },
                  },
                ]}
              >
                <Input
                  placeholder="123.456.789-01"
                  inputMode="numeric"
                  maxLength={14} // 000.000.000-00
                  onChange={(e) => form.setFieldsValue({ cpf: formatCPF(e.target.value) })}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={14}>
              <Form.Item name="address" label="Endereço" rules={[{ required: true, message: "Informe o endereço" }]}>
                <Input placeholder="Rua, número, bairro, cidade" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ marginTop: 8 }}>
            Observações
          </Divider>

          <Form.Item name="notes" label="Notas (opcional)">
            <Input.TextArea
              placeholder="Ex: prefere atendimento à tarde, comprador recorrente..."
              autoSize={{ minRows: 3, maxRows: 6 }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
