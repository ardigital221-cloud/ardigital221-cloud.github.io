const express = require("express");
const path = require("path");

const app = express();
const root = path.resolve(__dirname, "..");
const port = 4180;

app.use("/carlos3", express.static(root, { extensions: ["html"] }));
app.get("/", (_req, res) => res.redirect("/carlos3/"));

app.listen(port, () => {
  console.log(`GH Pages-style local server: http://localhost:${port}/carlos3/`);
});
