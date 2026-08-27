function moneyValue(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function calculateExpectedRegisterBalance({
  initialBalance = 0,
  sales = 0,
  entries = 0,
  exits = 0,
} = {}) {
  return moneyValue(initialBalance) + moneyValue(sales) + moneyValue(entries) - moneyValue(exits);
}
