const paymentGroup = (value) => {
  const method = String(value || "").toUpperCase();
  if (method === "PIX") return "Pix";
  if (method === "CASH") return "Dinheiro";
  if (method.includes("CARD") || method.includes("CREDIT")) return "Cartão";
  return "Outros";
};

const topRows = (map, limit = 5) => [...map.entries()]
  .map(([name, values]) => ({ name, ...values }))
  .sort((left, right) => (right.value ?? right.revenue ?? right.quantity ?? 0)
    - (left.value ?? left.revenue ?? left.quantity ?? 0))
  .slice(0, limit);

export function previousPeriodBounds(bounds) {
  if (!bounds) return null;
  const duration = bounds[1] - bounds[0];
  return duration > 0 ? [bounds[0] - duration, bounds[0]] : null;
}

export function calculateBusinessAnalytics({
  sales = [], products = [], bounds = null, previousBounds = previousPeriodBounds(bounds), now = Date.now(),
} = {}) {
  const inBounds = (timestamp, range) => !range || (timestamp >= range[0] && timestamp < range[1]);
  const valid = sales.filter((sale) => !sale.isCancelled && inBounds(Number(sale.timestamp) || 0, bounds));
  const previous = sales.filter((sale) => !sale.isCancelled && previousBounds
    && inBounds(Number(sale.timestamp) || 0, previousBounds));
  const productById = new Map(products.map((item) => [String(item.id ?? item.docId), item]));
  const productTotals = new Map();
  const paymentTotals = new Map();
  const hourTotals = new Map();
  const weekdayTotals = new Map();
  const customerTotals = new Map();
  let revenue = 0;
  let estimatedCost = 0;

  valid.forEach((sale) => {
    const amount = Number(sale.amount) || 0;
    revenue += amount;
    const date = new Date(Number(sale.timestamp) || 0);
    const hour = `${String(date.getHours()).padStart(2, "0")}:00`;
    hourTotals.set(hour, { value: (hourTotals.get(hour)?.value || 0) + amount });
    const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
    weekdayTotals.set(weekday, { value: (weekdayTotals.get(weekday)?.value || 0) + amount });
    (sale.payments || []).forEach((part) => {
      const label = paymentGroup(part.method);
      paymentTotals.set(label, { value: (paymentTotals.get(label)?.value || 0) + (Number(part.amount) || 0) });
    });
    const itemsTotal = (sale.items || []).reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
    const revenueRatio = itemsTotal > 0 ? Math.min(1, amount / itemsTotal) : 1;
    (sale.items || []).forEach((item) => {
      const product = productById.get(String(item.productId));
      const name = product?.name || item.productName || `Produto #${item.productId ?? "-"}`;
      const quantity = Number(item.quantity) || 0;
      const itemRevenue = (Number(item.subtotal) || 0) * revenueRatio;
      const current = productTotals.get(name) || { quantity: 0, revenue: 0, value: 0 };
      productTotals.set(name, {
        quantity: current.quantity + quantity,
        revenue: current.revenue + itemRevenue,
        value: current.quantity + quantity,
      });
      estimatedCost += (Number(product?.costPrice) || 0) * quantity;
    });
    if (sale.customerName) {
      const current = customerTotals.get(sale.customerName) || { value: 0 };
      customerTotals.set(sale.customerName, { value: current.value + amount });
    }
  });

  const previousRevenue = previous.reduce((sum, sale) => sum + (Number(sale.amount) || 0), 0);
  const comparisonPercent = previousBounds && previousRevenue > 0
    ? ((revenue - previousRevenue) / previousRevenue) * 100
    : null;
  const soldProductIds = new Set(valid.flatMap((sale) => (sale.items || []).map((item) => String(item.productId))));
  const inactiveProducts = products
    .filter((item) => !soldProductIds.has(String(item.id ?? item.docId)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"))
    .slice(0, 10)
    .map((item) => ({ name: item.name || "Produto", stockQuantity: Number(item.stockQuantity) || 0 }));

  return {
    revenue,
    saleCount: valid.length,
    averageTicket: valid.length ? revenue / valid.length : 0,
    estimatedCost,
    estimatedProfit: revenue - estimatedCost,
    previousRevenue,
    comparisonPercent,
    topProducts: topRows(productTotals),
    paymentMethods: topRows(paymentTotals, 10),
    peakHours: topRows(hourTotals),
    peakWeekdays: topRows(weekdayTotals, 7),
    topCustomers: topRows(customerTotals),
    inactiveProducts,
    calculatedAt: now,
  };
}
