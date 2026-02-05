import { Button, Card, Form, Input, Select, message, Row, Col, Space, Table, Tag } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createUser, listUsers } from "../services/users";
import type { UserCreate, UserOut, UserRole } from "../services/users";

const ROLE_OPTIONS: UserRole[] = ["ADMIN", "STAFF"];

const ROLE_COLOR: Record<string, any> = {
  ADMIN: "red",
  STAFF: "blue",
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  STAFF: "Funcionário",
};

export default function Users() {
  const qc = useQueryClient();
  const [form] = Form.useForm<UserCreate>();

  const [q, setQ] = useState("");
  const [limit, setLimit] = useState<number>(10);
  const [offset, setOffset] = useState<number>(0);

  const usersQ = useQuery({
    queryKey: ["users", q, limit, offset],
    queryFn: () => listUsers({ q: q || undefined, limit, offset }),
  });

  const list = useMemo(() => (usersQ.data ?? []) as UserOut[], [usersQ.data]);

  const mut = useMutation({
    mutationFn: (payload: UserCreate) =>
      createUser({
        ...payload,
        email: payload.email.trim().toLowerCase(),
        name: payload.name.trim(),
      }),
    onSuccess: (u) => {
      message.success(`Funcionário criado! (#${u.id})`);
      form.resetFields();
      setOffset(0);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: any) => message.error(e?.response?.data?.detail ?? "Erro ao criar funcionário"),
  });

  const columns: ColumnsType<UserOut> = [
    { title: "ID", dataIndex: "id", width: 64 },
    {
      title: "Nome",
      dataIndex: "name",
      width: 160,
      ellipsis: true,
      render: (v) => <b>{String(v ?? "-")}</b>,
    },
    {
      title: "Email",
      dataIndex: "email",
      ellipsis: true,
      render: (v) => (
        <span title={String(v ?? "")} style={{ display: "inline-block", maxWidth: "100%" }}>
          {String(v ?? "-")}
        </span>
      ),
    },
    {
      title: "Permissão",
      dataIndex: "role",
      width: 120,
      align: "center",
      render: (v) => {
        const s = String(v ?? "-");
        return (
          <Tag style={{ marginInlineEnd: 0 }} color={ROLE_COLOR[s] ?? "default"}>
            {ROLE_LABEL[s] ?? s}
          </Tag>
        );
      },
    },
  ];

  const pagination: TablePaginationConfig = {
    current: Math.floor(offset / limit) + 1,
    pageSize: limit,
    showSizeChanger: true,
    pageSizeOptions: [5, 10, 20, 50],
    size: "small",
    onChange: (page, pageSize) => {
      const ps = pageSize ?? limit;
      setLimit(ps);
      setOffset((page - 1) * ps);
    },
  };

  return (
    <Row gutter={[12, 12]} style={{ padding: 12 }}>
      <Col xs={24} lg={8}>
        <Card title="Cadastrar Funcionário" style={{ borderRadius: 14 }}>
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => mut.mutate(values)}
            initialValues={{ role: "STAFF" as UserRole }}
            autoComplete="off"
          >
            <Form.Item name="name" label="Nome" rules={[{ required: true, message: "Informe o nome" }]}>
              <Input placeholder="Ex: Wesley Ian" />
            </Form.Item>

            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: "Informe o email" },
                { type: "email", message: "Email inválido" },
              ]}
            >
              <Input placeholder="ex: wesley@wimotos.com" />
            </Form.Item>

            <Form.Item
              name="password"
              label="Senha"
              rules={[
                { required: true, message: "Informe a senha" },
                { min: 6, message: "Senha muito curta (mín. 6)" },
              ]}
            >
              <Input.Password placeholder="Crie uma senha" />
            </Form.Item>

            <Form.Item name="role" label="Permissão" rules={[{ required: true, message: "Selecione a permissão" }]}>
              <Select
                options={ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_LABEL[r] ?? r }))}
                placeholder="Selecione"
              />
            </Form.Item>

            <Button type="primary" htmlType="submit" loading={mut.isPending} block>
              Cadastrar
            </Button>
          </Form>
        </Card>
      </Col>

      <Col xs={24} lg={16}>
        <Card
          title="Funcionários cadastrados"
          style={{ borderRadius: 14 }}
          styles={{ body: { paddingTop: 8, paddingBottom: 8 } }}
          extra={
            <Space>
              <Input
                placeholder="Buscar..."
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOffset(0);
                }}
                style={{ width: 240 }}
                allowClear
              />
              <Button onClick={() => qc.invalidateQueries({ queryKey: ["users"] })} size="small">
                Atualizar
              </Button>
            </Space>
          }
        >
          <Table
            rowKey="id"
            size="small"
            loading={usersQ.isLoading}
            dataSource={list}
            columns={columns}
            pagination={pagination}
            tableLayout="fixed"
          />
        </Card>
      </Col>
    </Row>
  );
}