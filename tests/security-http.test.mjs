import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { server, createServer } = require("../scripts/serve.js");
let base;
test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
test("HTTP: arquivos internos e caminhos codificados não são publicados", async () => {
  for (const path of ["/.git/config", "/.env", "/firebase-debug.log", "/firestore.rules",
    "/package.json", "/functions/index.js", "/scripts/serve.js", "/docs/migration.md",
    "/assets/../package.json", "/%2e%2e%5cpackage.json", "/%00index.html"]) {
    const response = await fetch(base + path);
    assert.ok(response.status >= 400, `${path}: ${response.status}`);
  }
});
test("HTTP: páginas e módulos funcionam com cabeçalhos de proteção", async () => {
  for (const path of ["/", "/admin/", "/admin/load-error.js", "/assets/js/app.js", "/assets/js/receipt-core.mjs", "/assets/goregisterlogo.png"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  }
  assert.equal((await fetch(base, { method: "POST" })).status, 405);
  assert.equal(await (await fetch(base, { method: "HEAD" })).text(), "");
});

test("HTTP: 429 com Retry-After, cabeçalhos falsos não evitam limite e janela se recupera", async () => {
  let now = 100000;
  const limited = createServer({ limit: 3, windowMs: 60000, clock: () => now });
  await new Promise((resolve) => limited.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${limited.address().port}/`;
  try {
    for (let i = 0; i < 3; i++) {
      const response = await fetch(url, { headers: { "X-Forwarded-For": `192.0.2.${i}`, "X-Real-IP": `192.0.2.${i}` } });
      assert.equal(response.status, 200);
      await response.text();
    }
    const blocked = await fetch(url, { headers: { "X-Forwarded-For": "198.51.100.8" } });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "60");
    assert.equal(blocked.headers.get("cache-control"), "no-store");
    await blocked.text();
    now += 60000;
    const recovered = await fetch(url);
    assert.equal(recovered.status, 200);
    await recovered.text();
    assert.equal(limited.headersTimeout, 10000);
    assert.equal(limited.requestTimeout, 15000);
  } finally {
    limited.closeAllConnections();
    await new Promise((resolve) => limited.close(resolve));
  }
});
