const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfLocalDay(now = Date.now()) {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function buildInternalAlerts({
  products = [],
  receivables = [],
  openRegister = null,
  subscription = null,
  now = Date.now(),
  cashOpenLimitHours = 12,
} = {}) {
  const alerts = [];
  const zeroStock = products.filter((item) =>
    item?.trackStock !== false && Number(item?.stockQuantity) <= 0
  );
  const lowStock = products.filter((item) => {
    const quantity = Number(item?.stockQuantity);
    const minimum = Number(item?.minStockThreshold);
    return item?.trackStock !== false && quantity > 0 && Number.isFinite(minimum) && quantity <= minimum;
  });
  if (zeroStock.length) alerts.push({
    id: "stock-zero", severity: "critical", title: "Produtos sem estoque",
    message: `${zeroStock.length} produto(s) precisam de reposição imediata.`,
  });
  if (lowStock.length) alerts.push({
    id: "stock-low", severity: "warning", title: "Estoque baixo",
    message: `${lowStock.length} produto(s) atingiram o estoque mínimo.`,
  });

  const today = startOfLocalDay(now);
  const overdue = receivables.filter((item) =>
    !["PAID", "CANCELLED"].includes(String(item?.status || ""))
      && Number(item?.outstandingAmountCents) > 0
      && Number(item?.dueAt) > 0
      && Number(item.dueAt) < today
  );
  if (overdue.length) alerts.push({
    id: "receivables-overdue", severity: "warning", title: "Contas vencidas",
    message: `${overdue.length} conta(s) de cliente aguardam recebimento.`,
  });

  const openedAt = Number(openRegister?.openingTimestamp) || 0;
  const openHours = openedAt > 0 ? Math.floor((now - openedAt) / (60 * 60 * 1000)) : 0;
  if (openRegister?.isOpen === true && openHours >= cashOpenLimitHours) alerts.push({
    id: "cash-open-long", severity: "warning", title: "Caixa aberto há muito tempo",
    message: `Este caixa está aberto há ${openHours} hora(s). Verifique se precisa fechá-lo.`,
  });

  const status = String(subscription?.status || "");
  const dueAt = Number(subscription?.nextDueAt) || 0;
  const noticeDays = Math.min(60, Math.max(0, Number(subscription?.noticeDays) || 7));
  if (["PAST_DUE", "SUSPENDED"].includes(status) || (dueAt > 0 && dueAt < today)) {
    alerts.push({
      id: "subscription-overdue", severity: "critical", title: "Assinatura pendente",
      message: "A assinatura está vencida ou suspensa. Entre em contato com o administrador.",
    });
  } else if (dueAt >= today && dueAt < today + (noticeDays + 1) * DAY_MS) {
    const days = Math.max(0, Math.ceil((dueAt - today) / DAY_MS));
    alerts.push({
      id: "subscription-due", severity: "info", title: "Assinatura próxima do vencimento",
      message: days === 0 ? "A assinatura vence hoje." : `A assinatura vence em ${days} dia(s).`,
    });
  }
  return alerts;
}
