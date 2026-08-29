import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  PRODUCT_STOCK_LEVEL,
  compareProductsByAvailabilityAndName,
  compareProductsByStockLevelAndName,
  productMatchesStockFilter,
  productStockLevel,
} from "../stock-order-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("classifica produtos por nivel de estoque", () => {
  assert.equal(productStockLevel({ hasStockControl: false, stockQuantity: 0 }), PRODUCT_STOCK_LEVEL.ACCEPTABLE);
  assert.equal(productStockLevel({ stockQuantity: 6, minStockThreshold: 5 }), PRODUCT_STOCK_LEVEL.ACCEPTABLE);
  assert.equal(productStockLevel({ stockQuantity: 5, minStockThreshold: 5 }), PRODUCT_STOCK_LEVEL.LOW);
  assert.equal(productStockLevel({ stockQuantity: 0, minStockThreshold: 5 }), PRODUCT_STOCK_LEVEL.OUT);
});

test("ordena por nivel de estoque e depois alfabeticamente", () => {
  const products = [
    { name: "Zinco", stockQuantity: 0, minStockThreshold: 5 },
    { name: "Álcool", stockQuantity: 3, minStockThreshold: 5 },
    { name: "Arroz", stockQuantity: 10, minStockThreshold: 5 },
    { name: "Açúcar", stockQuantity: 2, minStockThreshold: 5 },
    { name: "Feijão", stockQuantity: 0, minStockThreshold: 5 },
    { name: "Abacate", stockQuantity: 20, minStockThreshold: 5 },
  ];

  assert.deepEqual(
    products.sort(compareProductsByStockLevelAndName).map((product) => product.name),
    ["Abacate", "Arroz", "Açúcar", "Álcool", "Feijão", "Zinco"],
  );
});

test("ordena produtos disponiveis alfabeticamente e mantem esgotados no final", () => {
  const products = [
    { name: "Lucas", stockQuantity: 4, minStockThreshold: 5 },
    { name: "Abacate", stockQuantity: 0, minStockThreshold: 5 },
    { name: "Teste", hasStockControl: false },
    { name: "Maca", stockQuantity: 30, minStockThreshold: 5 },
    { name: "Baixo estoque", stockQuantity: 6, minStockThreshold: 10 },
    { name: "Zinco", stockQuantity: 0, minStockThreshold: 5 },
  ];

  assert.deepEqual(
    products.sort(compareProductsByAvailabilityAndName).map((product) => product.name),
    ["Baixo estoque", "Lucas", "Maca", "Teste", "Abacate", "Zinco"],
  );
});

test("lista de baixo estoque mantem os zerados depois dos produtos ainda disponiveis", () => {
  const products = [
    { name: "Café", stockQuantity: 0, minStockThreshold: 5 },
    { name: "Bolacha", stockQuantity: 2, minStockThreshold: 5 },
    { name: "Arroz", stockQuantity: 1, minStockThreshold: 5 },
    { name: "Detergente", stockQuantity: 12, minStockThreshold: 5 },
  ];

  const lowStock = products
    .filter((product) => productStockLevel(product) !== PRODUCT_STOCK_LEVEL.ACCEPTABLE)
    .sort(compareProductsByStockLevelAndName);

  assert.deepEqual(lowStock.map((product) => product.name), ["Arroz", "Bolacha", "Café"]);
});

test("filtra produtos por cada nivel de estoque", () => {
  const products = [
    { name: "Arroz", stockQuantity: 10, minStockThreshold: 5 },
    { name: "Feijão", stockQuantity: 3, minStockThreshold: 5 },
    { name: "Café", stockQuantity: 0, minStockThreshold: 5 },
    { name: "Serviço", hasStockControl: false },
  ];
  const namesFor = (filter) => products
    .filter((product) => productMatchesStockFilter(product, filter))
    .map((product) => product.name);

  assert.deepEqual(namesFor("ALL"), ["Arroz", "Feijão", "Café", "Serviço"]);
  assert.deepEqual(namesFor("ACCEPTABLE"), ["Arroz"]);
  assert.deepEqual(namesFor("LOW"), ["Feijão"]);
  assert.deepEqual(namesFor("OUT"), ["Café"]);
  assert.deepEqual(namesFor("UNLIMITED"), ["Serviço"]);
});

test("estoque geral e painel identificam visualmente cada nivel", async () => {
  const [app, styles] = await Promise.all([
    readFile(path.join(root, "app.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);

  assert.match(app, /label: "PRODUTO EM ESTOQUE"[\s\S]*badgeClass: "good"/);
  assert.match(app, /\["ACCEPTABLE", "Produto em estoque"\]/);
  assert.match(app, /label: "ESTOQUE BAIXO"[\s\S]*badgeClass: "warn"/);
  assert.match(app, /label: "SEM ESTOQUE"[\s\S]*badgeClass: "bad"/);
  assert.match(app, /label: "ESTOQUE ILIMITADO"[\s\S]*quantityLabel: "Sem limite"/);
  assert.match(app, /Mínimo:/);
  assert.match(app, /id="inventoryStockLevelFilter"/);
  assert.match(app, /inventory-filters-toolbar/);
  assert.match(app, /productMatchesStockFilter\(item, state\.filters\.inventoryStockLevel\)/);
  assert.match(app, /function renderPos\(\)[\s\S]*\.sort\(compareProductsByAvailabilityAndName\)/);
  assert.match(styles, /\.stock-level[\s\S]*\.stock-level--summary/);
  assert.match(styles, /\.inventory-filters-toolbar[\s\S]*grid-template-columns: minmax\(0, 2fr\) minmax\(240px, 1fr\)/);
});
