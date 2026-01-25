import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("TOTEM API P0 ALIVE");
});

app.get("/booking/start", (req, res) => {
  res.status(200).json({
    ok: true,
    master_slug: req.query.master_slug || null,
    source: req.query.source || null
  });
});

app.listen(port, () => {
  console.log("Server running on port", port);
});
