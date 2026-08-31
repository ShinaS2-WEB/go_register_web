import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("central de alertas reutiliza os dados reais no header", async () => {
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const headerStart = app.indexOf("function renderView()");
  const headerEnd = app.indexOf("function renderTopActions", headerStart);
  const header = app.slice(headerStart, headerEnd);

  assert.match(header, /currentInternalAlerts\(\)/);
  assert.match(header, /data-action="toggle-notifications"/);
  assert.match(header, /aria-label="Abrir notificações"/);
  assert.match(header, /aria-expanded="\$\{state\.notificationsOpen\}"/);
  assert.match(header, /alerts\.length > 9 \? "9\+"/);
});

test("popover e bottom sheet possuem fechamento e navegação acessíveis", async () => {
  const [app, styles] = await Promise.all([
    readFile(path.join(root, "app.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);

  assert.match(app, /role="dialog" aria-modal="true"/);
  assert.match(app, /data-close-notifications/);
  assert.match(app, /event\.key === "Escape" && state\.notificationsOpen/);
  assert.match(app, /inventoryStockLevel = destination\.filter/);
  assert.match(app, /receivablesStatus = destination\.filter/);
  assert.match(styles, /@keyframes notification-enter/);
  assert.match(styles, /@keyframes notification-sheet-enter/);
  assert.match(styles, /width: min\(380px, calc\(100vw - 32px\)\)/);
});

test("dashboard não mantém o antigo bloco grande de alertas", async () => {
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const start = app.indexOf("function renderDashboard()");
  const end = app.indexOf("function renderTransactionRow", start);
  const dashboard = app.slice(start, end);

  assert.doesNotMatch(dashboard, /internal-alerts|<h2>Alertas<\/h2>/);
});
