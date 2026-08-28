export const PRODUCT_STOCK_LEVEL = Object.freeze({
  ACCEPTABLE: 0,
  LOW: 1,
  OUT: 2,
});

const productNameCollator = new Intl.Collator("pt-BR", {
  sensitivity: "base",
  numeric: true,
});

function productHasStockControl(product) {
  if (typeof product?.hasStockControl === "boolean") return product.hasStockControl;
  return product?.tracksStock !== false;
}

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function productStockLevel(product) {
  if (!productHasStockControl(product)) return PRODUCT_STOCK_LEVEL.ACCEPTABLE;

  const quantity = numericValue(product?.stockQuantity);
  if (quantity <= 0) return PRODUCT_STOCK_LEVEL.OUT;

  const minimum = numericValue(product?.minStockThreshold);
  return quantity <= minimum ? PRODUCT_STOCK_LEVEL.LOW : PRODUCT_STOCK_LEVEL.ACCEPTABLE;
}

export function productMatchesStockFilter(product, filter = "ALL") {
  const normalizedFilter = String(filter || "ALL").toUpperCase();
  if (normalizedFilter === "ALL") return true;
  if (normalizedFilter === "UNLIMITED") return !productHasStockControl(product);
  if (!productHasStockControl(product)) return false;

  const levelsByFilter = {
    ACCEPTABLE: PRODUCT_STOCK_LEVEL.ACCEPTABLE,
    LOW: PRODUCT_STOCK_LEVEL.LOW,
    OUT: PRODUCT_STOCK_LEVEL.OUT,
  };
  return levelsByFilter[normalizedFilter] === productStockLevel(product);
}

export function compareProductsByStockLevelAndName(left, right) {
  const levelDifference = productStockLevel(left) - productStockLevel(right);
  if (levelDifference) return levelDifference;

  return productNameCollator.compare(
    String(left?.name || "").trim(),
    String(right?.name || "").trim(),
  );
}
