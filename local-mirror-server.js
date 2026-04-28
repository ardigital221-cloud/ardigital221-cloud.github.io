const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const port = 4173;
const target = "https://carlosprado.dev";

app.use(
  "/",
  createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    secure: true,
    headers: {
      Referer: target + "/",
      Origin: target,
    },
    onProxyReq: (proxyReq) => {
      proxyReq.setHeader("accept-encoding", "identity");
    },
  })
);

app.listen(port, () => {
  console.log(`Local mirror running at http://localhost:${port}`);
});
