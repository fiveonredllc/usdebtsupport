const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { IP2Location } = require("ip2location-nodejs");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3002;

const jsonParser = express.json({ limit: "256kb", type: "application/json" });

/** Must match onclick strings in public/index.html (en-dash in middle option). */
const DEBT_MAP = {
  "Under $10,000": 9500,
  "$10,000 – $20,000": 15000,
  "More than $20,000": 30000,
};

const TURBO_DEBT_URL = "https://www.acquisitionbrands.com/atc/lead/";

/** Full state/province name (IP2Location `region`) -> 2-letter code for US only. */
const US_STATE_NAME_TO_CODE = {};
[
  ["Alabama", "AL"],
  ["Alaska", "AK"],
  ["Arizona", "AZ"],
  ["Arkansas", "AR"],
  ["California", "CA"],
  ["Colorado", "CO"],
  ["Connecticut", "CT"],
  ["Delaware", "DE"],
  ["Florida", "FL"],
  ["Georgia", "GA"],
  ["Hawaii", "HI"],
  ["Idaho", "ID"],
  ["Illinois", "IL"],
  ["Indiana", "IN"],
  ["Iowa", "IA"],
  ["Kansas", "KS"],
  ["Kentucky", "KY"],
  ["Louisiana", "LA"],
  ["Maine", "ME"],
  ["Maryland", "MD"],
  ["Massachusetts", "MA"],
  ["Michigan", "MI"],
  ["Minnesota", "MN"],
  ["Mississippi", "MS"],
  ["Missouri", "MO"],
  ["Montana", "MT"],
  ["Nebraska", "NE"],
  ["Nevada", "NV"],
  ["New Hampshire", "NH"],
  ["New Jersey", "NJ"],
  ["New Mexico", "NM"],
  ["New York", "NY"],
  ["North Carolina", "NC"],
  ["North Dakota", "ND"],
  ["Ohio", "OH"],
  ["Oklahoma", "OK"],
  ["Oregon", "OR"],
  ["Pennsylvania", "PA"],
  ["Rhode Island", "RI"],
  ["South Carolina", "SC"],
  ["South Dakota", "SD"],
  ["Tennessee", "TN"],
  ["Texas", "TX"],
  ["Utah", "UT"],
  ["Vermont", "VT"],
  ["Virginia", "VA"],
  ["Washington", "WA"],
  ["West Virginia", "WV"],
  ["Wisconsin", "WI"],
  ["Wyoming", "WY"],
  ["District of Columbia", "DC"],
].forEach(([name, code]) => {
  US_STATE_NAME_TO_CODE[name.toLowerCase()] = code;
});

const ip2location = new IP2Location();
const IP2LOC_DB_PATH = path.join(__dirname, "ip2location", "IP2LOCATION-LITE-DB9.BIN");
let ip2locationReady = false;
try {
  ip2location.open(IP2LOC_DB_PATH);
  ip2locationReady = true;
} catch (e) {
  console.warn("IP2Location BIN not loaded (run scripts/update-ip2location.sh):", e.message);
}

function isIpv4String(s) {
  if (typeof s !== "string" || !s) return false;
  const parts = s.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d+$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

function mapDebtAmountToInt(raw) {
  if (raw == null || typeof raw !== "string") return null;
  const key = raw.trim();
  if (Object.prototype.hasOwnProperty.call(DEBT_MAP, key)) {
    return DEBT_MAP[key];
  }
  return null;
}

function getClientIp(req, body) {
  const forwarded = req.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  if (body && typeof body.ip === "string" && body.ip.trim()) {
    return body.ip.trim();
  }
  return req.socket.remoteAddress || "";
}

function digitsOnlyPhone(phone) {
  if (phone == null) return "";
  return String(phone).replace(/\D/g, "").slice(0, 10);
}

function buildTurboDebtFormBody({
  token,
  firstname,
  lastname,
  email,
  phone10,
  debtInt,
  state,
  trustedFormUrl,
  ip,
  uniqueId,
  sub1,
  tcpa,
  trueDebt,
  sub3,
  sub4,
  sub5,
}) {
  const params = new URLSearchParams();
  params.append("token", token);
  params.append("firstname", firstname);
  params.append("lastname", lastname);
  params.append("email", email);
  params.append("phone", phone10);
  params.append("debt_amount", String(debtInt));
  params.append("state", state);
  params.append("Trusted Form", trustedFormUrl);
  params.append("ip", ip);
  params.append("unique_id", uniqueId);
  params.append("sub1", sub1);
  params.append("sub2", "posts");
  if (tcpa) params.append("TCPA", tcpa);
  params.append("true_debt_amount", String(trueDebt));
  if (sub3) params.append("sub3", sub3);
  if (sub4) params.append("sub4", sub4);
  if (sub5) params.append("sub5", sub5);
  return params;
}

function isTurboDebtDebugEnabled(body) {
  if (!body || typeof body !== "object") return false;
  const v = body.td_debug;
  return v === true || v === 1 || v === "1" || v === "true";
}

/** Server env GEO_DEBUG=1 or request ?geo_debug=1 — logs IP2Location lookups. */
function isGeoDebugEnabled(req) {
  const env = process.env.GEO_DEBUG;
  if (env != null && String(env).trim() !== "" && /^(1|true|yes)$/i.test(String(env).trim())) {
    return true;
  }
  const q = req.query && req.query.geo_debug;
  return q === "1" || q === "true";
}

app.get("/api/client-config.js", (req, res) => {
  res.type("application/javascript");
  res.set("Cache-Control", "no-store");
  const apiSecret = process.env.LEAD_API_SECRET || "";
  const webhookUrl = process.env.PUBLIC_LEAD_WEBHOOK_URL || "/api/leads";
  res.send(`window.__USDS_LEADS=${JSON.stringify({ apiSecret, webhookUrl })};`);
});

/** Geo: IP -> US state code via local IP2Location BIN (see scripts/update-ip2location.sh). */
app.get("/api/client-geo", (req, res) => {
  res.set("Cache-Control", "no-store");
  const forwarded = req.get("x-forwarded-for");
  let ip =
    (forwarded && forwarded.split(",")[0].trim()) ||
    req.socket.remoteAddress ||
    "";
  if (!ip || ip === "::1" || ip === "127.0.0.1" || ip.startsWith("::ffff:127.0.0.1")) {
    return res.json({ ip: ip || null, regionCode: null });
  }
  const ipv4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (!isIpv4String(ipv4)) {
    return res.json({ ip: ipv4, regionCode: null });
  }
  if (!ip2locationReady) {
    return res.json({ ip: ipv4, regionCode: null });
  }
  try {
    const data = ip2location.getAll(ipv4);
    if (!data || data.countryShort !== "US" || !data.region || data.region === "-") {
      return res.json({ ip: ipv4, regionCode: null });
    }
    const regionCode =
      US_STATE_NAME_TO_CODE[String(data.region).trim().toLowerCase()] || null;
    if (regionCode && isGeoDebugEnabled(req)) {
      console.log("[client-geo] ip2location", {
        ip: ipv4,
        region: String(data.region).trim(),
        regionCode,
      });
    }
    return res.json({ ip: ipv4, regionCode });
  } catch (e) {
    console.warn("client-geo ip2location:", e.message);
    return res.json({ ip: ipv4, regionCode: null });
  }
});

app.post("/api/leads", jsonParser, async (req, res) => {
  const expected = process.env.LEAD_API_SECRET;
  const gasUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  const sheetSecret = process.env.SHEET_SHARED_SECRET;
  const tdToken = process.env.TURBODEBT_PARTNER_TOKEN || "";

  if (!expected || !gasUrl || !sheetSecret) {
    return res.status(503).json({ ok: false, error: "server_misconfigured" });
  }

  if (req.get("x-api-secret") !== expected) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const tdDebug = isTurboDebtDebugEnabled(body);
  const bodyForForward = { ...body };
  delete bodyForForward.td_debug;

  const received_at_utc = new Date().toISOString();
  const unique_id = crypto.randomUUID();
  const ip = getClientIp(req, body);
  const trusted_form_cert =
    typeof body.trusted_form_cert === "string"
      ? body.trusted_form_cert.trim()
      : "";

  const debt_amount_raw = typeof body.debt_amount === "string" ? body.debt_amount.trim() : "";
  const debtInt = mapDebtAmountToInt(debt_amount_raw);

  /** Same value posted to TurboDebt and stored in the sheet. */
  const resolvedSub1 =
    (typeof body.sub1 === "string" && body.sub1.trim()) || "usdebtsupport_web";
  const phone10 = digitsOnlyPhone(body.phone);

  let turbodebt_status = "skipped";
  let turbodebt_redirect_url = "";
  let turbodebt_message = "";
  let turbodebtDebug = null;

  if (debtInt === null) {
    if (tdDebug) {
      turbodebtDebug = {
        phase: "skipped",
        reason: "debt_amount_not_mapped_for_buyer",
        debt_amount_raw,
      };
    }
  } else if (!tdToken) {
    turbodebt_status = "error";
    turbodebt_message = "missing_partner_token";
    if (tdDebug) {
      turbodebtDebug = { phase: "not_called", reason: "missing_partner_token" };
    }
  } else if (!body.state || String(body.state).trim().length !== 2) {
    turbodebt_status = "error";
    turbodebt_message = "invalid_state";
    if (tdDebug) {
      turbodebtDebug = { phase: "not_called", reason: "invalid_state" };
    }
  } else if (phone10.length !== 10) {
    turbodebt_status = "error";
    turbodebt_message = "invalid_phone";
    if (tdDebug) {
      turbodebtDebug = { phase: "not_called", reason: "invalid_phone" };
    }
  } else {
    const formBody = buildTurboDebtFormBody({
      token: tdToken,
      firstname: String(body.first_name || "").trim(),
      lastname: String(body.last_name || "").trim(),
      email: String(body.email || "").trim(),
      phone10,
      debtInt,
      state: String(body.state).trim().toUpperCase(),
      trustedFormUrl: trusted_form_cert,
      ip,
      uniqueId: unique_id,
      sub1: resolvedSub1,
      tcpa: typeof body.tcpa_language === "string" ? body.tcpa_language : "",
      trueDebt: debtInt,
      sub3: typeof body.sub3 === "string" ? body.sub3.trim() : "",
      sub4: typeof body.sub4 === "string" ? body.sub4.trim() : "",
      sub5: typeof body.sub5 === "string" ? body.sub5.trim() : "",
    });

    // td_debug: full request body (includes token). Redact token again before production.
    const requestBodyRaw = formBody.toString();

    try {
      const r = await fetch(TURBO_DEBT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody,
      });
      const text = await r.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      if (parsed && typeof parsed.status === "string") {
        turbodebt_status = parsed.status;
        if (typeof parsed.redirect_url === "string") {
          turbodebt_redirect_url = parsed.redirect_url;
        }
        if (typeof parsed.message === "string") {
          turbodebt_message = parsed.message;
        }
      } else {
        turbodebt_status = "error";
        turbodebt_message = "invalid_response";
      }
      if (tdDebug) {
        turbodebtDebug = {
          phase: "called",
          url: TURBO_DEBT_URL,
          method: "POST",
          requestContentType: "application/x-www-form-urlencoded",
          requestBody: requestBodyRaw,
          responseStatus: r.status,
          responseBody: text,
          responseJson: parsed,
          turbodebt_status,
          turbodebt_message,
        };
      }
    } catch (err) {
      console.error("TurboDebt post error:", err);
      turbodebt_status = "error";
      turbodebt_message = "upstream_unreachable";
      if (tdDebug) {
        turbodebtDebug = {
          phase: "fetch_failed",
          url: TURBO_DEBT_URL,
          method: "POST",
          requestContentType: "application/x-www-form-urlencoded",
          requestBody: requestBodyRaw,
          fetchError: err && err.message ? String(err.message) : String(err),
        };
      }
    }
  }

  const forward = {
    ...bodyForForward,
    sub1: resolvedSub1,
    debt_amount: debtInt !== null ? debtInt : "",
    debt_amount_raw,
    true_debt_amount: debtInt !== null ? debtInt : "",
    unique_id,
    ip,
    trusted_form_cert,
    turbodebt_status,
    turbodebt_redirect_url,
    turbodebt_message,
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
      return res.status(502).json({
        ok: false,
        error: "upstream_error",
        ...(tdDebug && turbodebtDebug ? { turbodebt_debug: turbodebtDebug } : {}),
      });
    }

    if (parsed && parsed.ok === false) {
      return res.status(502).json({
        ok: false,
        error: parsed.error || "upstream_rejected",
        ...(tdDebug && turbodebtDebug ? { turbodebt_debug: turbodebtDebug } : {}),
      });
    }

    return res.status(200).json({
      ok: true,
      turbodebt_status,
      redirect_url: turbodebt_redirect_url || null,
      ...(tdDebug && turbodebtDebug ? { turbodebt_debug: turbodebtDebug } : {}),
    });
  } catch (err) {
    console.error("Leads forward error:", err);
    return res.status(502).json({
      ok: false,
      error: "upstream_unreachable",
      ...(tdDebug && turbodebtDebug ? { turbodebt_debug: turbodebtDebug } : {}),
    });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`usdebtsupport listening on :${PORT}`);
});
