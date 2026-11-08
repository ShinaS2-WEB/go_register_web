export function validateStockItems(items) {
  if (!Array.isArray(items) || items.length > 5) throw Error("Use no máximo 5 produtos por conta.");
  const ids = new Set();
  const total = items.reduce((sum, item) => {
    if (!Number.isSafeInteger(item.productId) || item.productId <= 0 || ids.has(item.productId) ||
        typeof item.name !== "string" || !item.name.trim() || item.name.length > 160 ||
        !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 1000000 ||
        !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents <= 0 || item.unitPriceCents > 99999999999) throw Error("Produto, quantidade ou preço inválido.");
    ids.add(item.productId);
    const value = Math.round(item.quantity * item.unitPriceCents);
    if (!Number.isSafeInteger(value) || value <= 0) throw Error("Valor do item inválido.");
    return sum + value;
  }, 0);
  if (!Number.isSafeInteger(total) || total > 99999999999) throw Error("Total excede o limite.");
  return total;
}

export function receivableEntryId(paymentId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) throw Error("Identificador de pagamento inválido.");
  return -Math.max(1, Number.parseInt(paymentId.replaceAll("-", "").slice(0, 13), 16));
}

export function receivablePaymentDescription(account, amountCents) {
  const amount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountCents / 100);
  return [`${String(account.customerName || "Cliente").toLocaleUpperCase("pt-BR")} PAGOU ${amount}`,
    String(account.description || "").trim(), (account.stockItems || []).map(item => `${item.name} × ${item.quantity}`).join(", ")]
    .filter(Boolean).join(" — ");
}

export function stockItemsLabel(account) {
  return [account.description, ...(account.stockItems || []).map(item => `${item.name} × ${item.quantity}`)].filter(Boolean).join(" — ") || "Conta manual";
}

// O vínculo interno permanece salvo; somente sua apresentação é simplificada.
export function isReceivableIncome(entry) {
  return String(entry.category || "").startsWith("RECEIVABLE_PAYMENT:");
}

export function incomePresentation(entry) {
  const description = String(entry.description || "").trim();
  if (!isReceivableIncome(entry)) return {title: description || "Entrada", details: []};
  const payment = description.match(/^(.*?)\s+PAGOU\s+R\$\s*[\d.,]+(?:\s+—\s+([\s\S]*))?$/i);
  if (!payment) return {title: "Pagamento de cliente", details: description ? [description] : []};
  return {
    title: `${payment[1]} pagou`,
    details: (payment[2] || "").split(" — ").map(part => part.trim()).filter(Boolean)
  };
}
