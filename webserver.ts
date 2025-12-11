import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_req, res) => {
  res.send("AmazonMonitor bot is running!");
});

app.listen(PORT, () => {
  console.log(`[WEB] Web server running on port ${PORT}`);
});
