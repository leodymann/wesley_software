import { Card, Col, Divider, Row, Statistic, Typography } from "antd";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listClients } from "../services/clients";
import { listProducts } from "../services/products";
import { listSales } from "../services/sales";
import { listPromissories } from "../services/promissories";
import { listInstallments } from "../services/installments";

const { Text } = Typography;

function moneyBR(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function safeNum(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  width: "100%",
  height: "100%",
};

const cardBodyStyle: React.CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
};

export default function Dashboard() {
  const clientsQ = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const productsQ = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const salesQ = useQuery({ queryKey: ["sales"], queryFn: listSales });
  const promQ = useQuery({ queryKey: ["promissories"], queryFn: listPromissories });
  const instQ = useQuery({ queryKey: ["installments"], queryFn: listInstallments });

  const loading =
    clientsQ.isLoading ||
    productsQ.isLoading ||
    salesQ.isLoading ||
    promQ.isLoading ||
    instQ.isLoading;

  const clients = (clientsQ.data ?? []) as any[];
  const products = (productsQ.data ?? []) as any[];

  const salesRaw = salesQ.data as any;
  const sales: any[] = useMemo(() => {
    if (Array.isArray(salesRaw)) return salesRaw;
    if (salesRaw && typeof salesRaw === "object") {
      const arr = Object.values(salesRaw).find((v) => Array.isArray(v));
      if (Array.isArray(arr)) return arr as any[];
    }
    return [];
  }, [salesRaw]);

  const promissories = (promQ.data ?? []) as any[];
  const installments = (instQ.data ?? []) as any[];

  const metrics = useMemo(() => {
    const clientsTotal = clients.length;

    const productsTotal = products.length;
    const inStock = products.filter((p) => String(p?.status) === "IN_STOCK").length;
    const reserved = products.filter((p) => String(p?.status) === "RESERVED").length;
    const sold = products.filter((p) => String(p?.status) === "SOLD").length;

    const sumStockValue = products
      .filter((p) => String(p?.status) === "IN_STOCK")
      .reduce((acc, p) => acc + safeNum(p?.sale_price), 0);

    const salesTotal = sales.length;
    const salesConfirmed = sales.filter((s) => String(s?.status) === "CONFIRMED").length;
    const salesDraft = sales.filter((s) => String(s?.status) === "DRAFT").length;
    const salesCanceled = sales.filter((s) => String(s?.status) === "CANCELED").length;

    const revenueConfirmed = sales
      .filter((s) => String(s?.status) === "CONFIRMED")
      .reduce((acc, s) => acc + safeNum(s?.total), 0);

    const discountSum = sales.reduce((acc, s) => acc + safeNum(s?.discount), 0);
    const entrySum = sales.reduce((acc, s) => acc + safeNum(s?.entry_amount), 0);

    const promTotal = promissories.length;
    const promDraft = promissories.filter((p) => String(p?.status) === "DRAFT").length;
    const promIssued = promissories.filter((p) => String(p?.status) === "ISSUED").length;
    const promPaid = promissories.filter((p) => String(p?.status) === "PAID").length;
    const promCanceled = promissories.filter((p) => String(p?.status) === "CANCELED").length;

    const instTotal = installments.length;
    const instPending = installments.filter((i) => String(i?.status) === "PENDING").length;
    const instPaid = installments.filter((i) => String(i?.status) === "PAID").length;
    const instCanceled = installments.filter((i) => String(i?.status) === "CANCELED").length;

    const instPendingValue = installments
      .filter((i) => String(i?.status) === "PENDING")
      .reduce((acc, i) => acc + safeNum(i?.amount), 0);

    const instPaidValue = installments
      .filter((i) => String(i?.status) === "PAID")
      .reduce((acc, i) => acc + safeNum(i?.paid_amount), 0);

    return {
      clientsTotal,
      productsTotal,
      inStock,
      reserved,
      sold,
      sumStockValue,
      salesTotal,
      salesConfirmed,
      salesDraft,
      salesCanceled,
      revenueConfirmed,
      discountSum,
      entrySum,
      promTotal,
      promDraft,
      promIssued,
      promPaid,
      promCanceled,
      instTotal,
      instPending,
      instPaid,
      instCanceled,
      instPendingValue,
      instPaidValue,
    };
  }, [clients, products, sales, promissories, installments]);

  return (
    <div
      style={{
        padding: 12,
        width: "100%",
        maxWidth: "100%",
        overflowX: "hidden",
      }}
    >
      <Row gutter={[12, 12]} align="stretch" style={{ width: "100%" }}>
        <Col xs={24} md={8} style={{ display: "flex" }}>
          <Card loading={loading} style={cardStyle} styles={{ body: cardBodyStyle }} size="small">
            <Statistic title="Clientes cadastrados" value={metrics.clientsTotal} />
            <Divider style={{ margin: "8px 0" }} />
            <Text type="secondary">Total de clientes no sistema.</Text>
            <div style={{ flex: 1 }} />
          </Card>
        </Col>

        <Col xs={24} md={8} style={{ display: "flex" }}>
          <Card loading={loading} style={cardStyle} styles={{ body: cardBodyStyle }} size="small">
            <Statistic title="Produtos cadastrados" value={metrics.productsTotal} />
            <Divider style={{ margin: "8px 0" }} />
            <Row gutter={12}>
              <Col span={8}>
                <Statistic title="Em estoque" value={metrics.inStock} />
              </Col>
              <Col span={8}>
                <Statistic title="Reservados" value={metrics.reserved} />
              </Col>
              <Col span={8}>
                <Statistic title="Vendidos" value={metrics.sold} />
              </Col>
            </Row>
            <Divider style={{ margin: "8px 0" }} />
            <Statistic title="Valor do estoque (venda)" value={moneyBR(metrics.sumStockValue)} />
            <div style={{ flex: 1 }} />
          </Card>
        </Col>

        <Col xs={24} md={8} style={{ display: "flex" }}>
          <Card loading={loading} style={cardStyle} styles={{ body: cardBodyStyle }} size="small">
            <Statistic title="Vendas (total)" value={metrics.salesTotal} />
            <Divider style={{ margin: "8px 0" }} />
            <Row gutter={12}>
              <Col span={8}>
                <Statistic title="Confirmadas" value={metrics.salesConfirmed} />
              </Col>
              <Col span={8}>
                <Statistic title="Rascunho" value={metrics.salesDraft} />
              </Col>
              <Col span={8}>
                <Statistic title="Canceladas" value={metrics.salesCanceled} />
              </Col>
            </Row>
            <Divider style={{ margin: "8px 0" }} />
            <Statistic title="Receita (confirmadas)" value={moneyBR(metrics.revenueConfirmed)} />
            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col span={12}>
                <Statistic title="Descontos" value={moneyBR(metrics.discountSum)} />
              </Col>
              <Col span={12}>
                <Statistic title="Entradas" value={moneyBR(metrics.entrySum)} />
              </Col>
            </Row>
            <div style={{ flex: 1 }} />
          </Card>
        </Col>

        <Col xs={24} md={12} style={{ display: "flex" }}>
          <Card loading={loading} style={cardStyle} styles={{ body: cardBodyStyle }} title="Promissórias" size="small">
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <Statistic title="Total" value={metrics.promTotal} />
              </Col>
              <Col span={12}>
                <Statistic title="Rascunho" value={metrics.promDraft} />
              </Col>
              <Col span={12}>
                <Statistic title="Emitidas" value={metrics.promIssued} />
              </Col>
              <Col span={12}>
                <Statistic title="Pagas" value={metrics.promPaid} />
              </Col>
            </Row>
            <Divider style={{ margin: "8px 0" }} />
            <Statistic title="Canceladas" value={metrics.promCanceled} />
            <div style={{ flex: 1 }} />
          </Card>
        </Col>

        <Col xs={24} md={12} style={{ display: "flex" }}>
          <Card loading={loading} style={cardStyle} styles={{ body: cardBodyStyle }} title="Parcelas" size="small">
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <Statistic title="Total" value={metrics.instTotal} />
              </Col>
              <Col span={12}>
                <Statistic title="Pendentes" value={metrics.instPending} />
              </Col>
              <Col span={12}>
                <Statistic title="Pagas" value={metrics.instPaid} />
              </Col>
              <Col span={12}>
                <Statistic title="Canceladas" value={metrics.instCanceled} />
              </Col>
            </Row>
            <Divider style={{ margin: "8px 0" }} />
            <Row gutter={12}>
              <Col span={12}>
                <Statistic title="Em aberto" value={moneyBR(metrics.instPendingValue)} />
              </Col>
              <Col span={12}>
                <Statistic title="Pago" value={moneyBR(metrics.instPaidValue)} />
              </Col>
            </Row>
            <div style={{ flex: 1 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
