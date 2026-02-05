import { Layout, Menu, Button } from "antd";
import {
  DashboardOutlined,
  UserOutlined,
  ShoppingOutlined,
  DollarOutlined,
  FileTextOutlined,
  ScheduleOutlined,
  ShoppingCartOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { logout, getRoleFromToken } from "../services/auth";
import { TeamOutlined } from "@ant-design/icons";


const { Header, Sider, Content } = Layout;

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const role = getRoleFromToken();

  const items = [
    { key: "/dashboard", icon: <DashboardOutlined />, label: <Link to="/dashboard">Dashboard</Link> },
    { key: "/clients", icon: <UserOutlined />, label: <Link to="/clients">Clientes</Link> },
    { key: "/products", icon: <ShoppingOutlined />, label: <Link to="/products">Produtos</Link> },
    { key: "/sales", icon: <ShoppingCartOutlined />, label: <Link to="/sales">Vendas</Link> },
    { key: "/promissories", icon: <FileTextOutlined />, label: <Link to="/promissories">Promissórias</Link> },
    { key: "/installments", icon: <ScheduleOutlined />, label: <Link to="/installments">Parcelas</Link> },
    { key: "/users", icon: <TeamOutlined />, label: <Link to="/users">Funcionários</Link> },

    // Finance só aparece se ADMIN (se role existir no JWT)
    ...(role === "ADMIN"
      ? [{ key: "/finance", icon: <DollarOutlined />, label: <Link to="/finance">Financeiro</Link> }]
      : []),
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider collapsible>
        <div style={{ color: "white", padding: 16, fontWeight: 700 }}>WI Motos</div>
        <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={items} />
      </Sider>

      <Layout>
        <Header style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
          <Button
            icon={<LogoutOutlined />}
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Sair
          </Button>
        </Header>

        <Content style={{ padding: 16 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
