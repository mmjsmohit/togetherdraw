import http from "node:http";
import net from "node:net";
import process from "node:process";
import next from "next";

const dev = process.env.NODE_ENV === "development";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const apiHost = process.env.HTTP_BACKEND_HOST || "127.0.0.1";
const apiPort = Number(process.env.HTTP_BACKEND_PORT || 4000);
const wsHost = process.env.WS_BACKEND_HOST || "127.0.0.1";
const wsPort = Number(process.env.WS_BACKEND_PORT || 4001);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function getPath(requestUrl = "/", host = "localhost") {
  return new URL(requestUrl, `http://${host}`).pathname;
}

function isApiRequest(req) {
  const path = getPath(req.url, req.headers.host);
  return path === "/anon-login" || path.startsWith("/boards");
}

function proxyHttp(req, res) {
  const proxyReq = http.request(
    {
      host: apiHost,
      port: apiPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${apiHost}:${apiPort}`,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
    }
    res.end(JSON.stringify({ message: "API service unavailable" }));
  });

  req.pipe(proxyReq);
}

function proxyWebSocket(req, socket, head) {
  const path = getPath(req.url, req.headers.host);
  if (path !== "/ws") {
    socket.destroy();
    return;
  }

  const targetSocket = net.connect(wsPort, wsHost, () => {
    targetSocket.write(`GET ${req.url || "/"} HTTP/${req.httpVersion}\r\n`);
    for (const [name, value] of Object.entries(req.headers)) {
      const headerValue = Array.isArray(value) ? value.join(", ") : value;
      if (headerValue) {
        targetSocket.write(`${name}: ${headerValue}\r\n`);
      }
    }
    targetSocket.write("\r\n");
    if (head.length > 0) {
      targetSocket.write(head);
    }

    socket.pipe(targetSocket).pipe(socket);
  });

  const closeSockets = () => {
    socket.destroy();
    targetSocket.destroy();
  };

  socket.on("error", closeSockets);
  targetSocket.on("error", closeSockets);
}

await app.prepare();

const server = http.createServer((req, res) => {
  if (isApiRequest(req)) {
    proxyHttp(req, res);
    return;
  }

  handle(req, res);
});

server.on("upgrade", proxyWebSocket);

server.listen(port, hostname, () => {
  console.log(`Web server listening on http://${hostname}:${port}`);
});
