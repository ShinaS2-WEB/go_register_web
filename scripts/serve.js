const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createMemoryLimiter } = require("../functions/src/rate-limit");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT) || 4173;
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const publicFiles = new Set([
  "index.html", "assets/js/app.js", "assets/css/styles.css", "assets/css/receipt-layout.css",
  "assets/js/receipt-core.mjs", "assets/js/keyboard.mjs", "assets/js/receivables-core.mjs", "assets/js/password-core.mjs",
  "assets/js/cash-register-core.mjs", "assets/js/stock-order-core.mjs", "assets/js/receivables-stock-core.mjs", "assets/js/alerts-core.mjs",
  "assets/js/business-analytics-core.mjs", "admin/index.html", "admin/admin.js",
  "admin/load-error.js", "admin/android-update-core.mjs", "admin/admin.css", "admin/notifications.css",
]);
const securityHeaders = Object.fromEntries(
  require("../firebase.json").hosting.headers.find((entry) => entry.source === "**")
    .headers.map(({ key, value }) => [key, value])
);

function createServer({ limit = 120, windowMs = 60000, clock = Date.now } = {}) {
const limiter = createMemoryLimiter({ limit, windowMs, maxKeys: 1000, clock });
const server = http.createServer({ maxHeaderSize: 16384 }, (request, response) => {
  for (const [key, value] of Object.entries(securityHeaders)) response.setHeader(key, value);
  // This is a loopback development server, not a trusted reverse proxy.
  // Forwarding headers are client input and must not select the quota key.
  const quota = limiter.consume(request.socket.remoteAddress || "unknown");
  if (!quota.allowed) {
    response.writeHead(429, {
      "Retry-After": String(quota.retryAfterSeconds),
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      Connection: "close",
    }).end("Muitas solicitações. Aguarde antes de tentar novamente.");
    return;
  }
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end("Requisição inválida");
    return;
  }

  const relativePath = pathname.replace(/^\/+/, "");
  let filePath = path.resolve(root, relativePath || "index.html");
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end("Acesso negado");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  const publicPath = path.relative(root, filePath).split(path.sep).join("/");
  const isAsset = /^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:png|svg|jpg|jpeg|webp|ico|js|mjs|woff2?|txt)$/.test(publicPath);
  if (!publicFiles.has(publicPath) && !isAsset) {
    response.writeHead(404).end("Arquivo não encontrado");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Página não encontrada");
    return;
  }
  const resolvedPath = fs.realpathSync(filePath);
  if (!resolvedPath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end();
    return;
  }

  response.writeHead(200, {
    "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  if (request.method === "HEAD") return response.end();
  fs.createReadStream(resolvedPath).on("error", () => response.destroy()).pipe(response);
});
server.headersTimeout = 10000;
server.requestTimeout = 15000;
server.keepAliveTimeout = 5000;
server.timeout = 15000;
server.maxRequestsPerSocket = 100;
server.maxConnections = 100;
server.maxHeadersCount = 100;
return server;
}

const server = createServer();

if (require.main === module) server.listen(port, "127.0.0.1", () => {
  console.log(`GO REGISTER: http://localhost:${port}`);
  console.log(`Administração: http://localhost:${port}/admin/`);
  console.log('Firebase Host: https://goregister-7394b.web.app');
});
module.exports = { server, createServer };
