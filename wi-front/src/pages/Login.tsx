import { Card, Form, Input, Button, message, Typography, Space } from "antd";
import { useNavigate } from "react-router-dom";
import { login } from "../services/auth";

const { Title, Text } = Typography;

export default function Login() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        background:
          "radial-gradient(900px 500px at 20% 20%, rgba(22,119,255,.18), transparent 60%), radial-gradient(700px 420px at 85% 25%, rgba(82,196,26,.12), transparent 60%), linear-gradient(180deg, #f7f9ff 0%, #ffffff 55%, #f6f6f6 100%)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Topo (branding simples) */}
        <div
          style={{
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "linear-gradient(135deg, #1677ff, #1386dd)",
              boxShadow: "0 10px 24px rgba(0,0,0,.10)",
              display: "grid",
              placeItems: "center",
              color: "white",
              fontWeight: 800,
              letterSpacing: 0.5,
              userSelect: "none",
            }}
          >
            WI
          </div>

          <div style={{ lineHeight: 1.1 }}>
            <Title level={4} style={{ margin: 0 }}>
              WI Motos
            </Title>
            <Text type="secondary">Acesso ao painel</Text>
          </div>
        </div>

        <Card
          style={{
            width: "100%",
            borderRadius: 18,
            boxShadow: "0 18px 40px rgba(0,0,0,.08)",
          }}
          styles={{
            body: { padding: 18 },
            header: { borderTopLeftRadius: 18, borderTopRightRadius: 18 },
          }}
        >
          <Space direction="vertical" size={6} style={{ width: "100%", marginBottom: 14 }}>
            <Title level={5} style={{ margin: 0 }}>
              Entrar
            </Title>
            <Text type="secondary">Use seu email e senha para continuar.</Text>
          </Space>

          <Form
            layout="vertical"
            autoComplete="off"
            onFinish={async (values) => {
              try {
                await login(values.email, values.password);
                message.success("Logado!");
                navigate("/dashboard");
              } catch (e: any) {
                message.error(e?.response?.data?.detail ?? "Falha no login");
              }
            }}
          >
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: "Informe o email" },
                { type: "email", message: "Email inválido" },
              ]}
            >
              <Input placeholder="ex: admin@admin.com" size="large" />
            </Form.Item>

            <Form.Item
              name="password"
              label="Senha"
              rules={[{ required: true, message: "Informe a senha" }]}
              style={{ marginBottom: 10 }}
            >
              <Input.Password placeholder="Digite sua senha" size="large" />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              style={{ borderRadius: 12, height: 44 }}
            >
              Entrar
            </Button>
          </Form>

          <div style={{ marginTop: 12, textAlign: "center", opacity: 0.75 }}>
            <Text type="secondary">© {new Date().getFullYear()} WI Motos</Text>
          </div>
        </Card>
      </div>
    </div>
  );
}
