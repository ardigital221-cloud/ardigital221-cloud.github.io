const express = require("express");
const path = require("path");

const app = express();
const root = path.resolve(__dirname, "..");
const port = 4190;

app.use(express.static(root, { extensions: ["html"] }));

app.listen(port, () => {
  console.log(`Root local server: http://localhost:${port}/`);
});
