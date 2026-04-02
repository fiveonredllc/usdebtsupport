const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3002;

const jsonParser = express.json({ limit: "256kb", type: "application/json" });

app.get("/api/client-config.js", (req, res) => {
  res.type("application/javascript");
  res.set("Cache-Control", "no-store");
  const apiSecret = process.env.LEAD_API_SECRET || "";
  const webhookUrl = process.env.PUBLIC_LEAD_WEBHOOK_URL || "/api/leads";
  res.send(`window.__USDS_LEADS=${JSON.stringify({ apiSecret, webhookUrl })};`);
});

app.post("/api/leads", jsonParser, async (req, res) => {
  const expected = process.env.LEAD_API_SECRET;
  const gasUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  const sheetSecret = process.env.SHEET_SHARED_SECRET;

  if (!expected || !gasUrl || !sheetSecret) {
    return res.status(503).json({ ok: false, error: "server_misconfigured" });
  }

  if (req.get("x-api-secret") !== expected) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const received_at_utc = new Date().toISOString();
  const forward = {
    ...req.body,
    sheet_shared_secret: sheetSecret,
    received_at_utc,
  };

  try {
    const r = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forward),
    });

    const text = await r.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (!r.ok) {
      return res.status(502).json({ ok: false, error: "upstream_error" });
    }

    if (parsed && parsed.ok === false) {
      return res.status(502).json({ ok: false, error: parsed.error || "upstream_rejected" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Leads forward error:", err);
    return res.status(502).json({ ok: false, error: "upstream_unreachable" });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`usdebtsupport listening on :${PORT}`);
});
