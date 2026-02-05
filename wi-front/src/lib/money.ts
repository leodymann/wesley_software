// tenta transformar strings de decimal gigantes em algo exibível.
// Se não der, devolve a própria string.
export function formatMoneyBR(value: unknown): string {
  if (value === null || value === undefined) return "-";

  // se vier number, formata direto
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  // strings tipo 123.45, +123.45, -123.45
  if (typeof value === "string") {
    const s = value.trim();

    // tenta extrair um número normal (até 2 casas) do começo da string
    const m = s.match(/^([+-])?(\d+)(\.\d{1,2})?$/);
    if (m) {
      const n = Number(s);
      if (Number.isFinite(n)) {
        return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      }
    }

    // fallback: se for gigante, mostra só uma versão curta
    if (s.length > 24) return `${s.slice(0, 12)}…${s.slice(-6)}`;
    return s;
  }

  return String(value);
}
