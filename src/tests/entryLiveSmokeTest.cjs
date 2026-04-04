const http = require("http");
const https = require("https");
const { URL } = require("url");

function fail(code, detail){
  const err = new Error(code);
  err.code = code;
  if (detail) {
    err.detail = detail;
  }
  throw err;
}

function requestRaw(urlString, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === "https:" ? https : http;

    const req = transport.request(url, {
      method: "GET",
      headers
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString("utf8");
        let json = null;

        if ((res.headers["content-type"] || "").includes("application/json")) {
          try {
            json = JSON.parse(text || "{}");
          } catch (err) {
            return reject(err);
          }
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          buffer,
          text,
          json
        });
      });
    });

    req.on("error", reject);
    req.end();
  });
}

function assert(condition, code, detail){
  if (!condition) {
    fail(code, detail);
  }
}

(async () => {
  const baseUrl = String(process.env.ENTRY_SMOKE_BASE_URL || "http://localhost:8080").trim().replace(/\/+$/, "");
  const ownerType = String(process.env.ENTRY_SMOKE_OWNER_TYPE || "salon").trim().toLowerCase();
  const slug = String(process.env.ENTRY_SMOKE_SLUG || "totem-demo-salon").trim().toLowerCase();
  const token = String(process.env.ENTRY_SMOKE_TOKEN || "").trim();

  if (!token) {
    fail("ENTRY_SMOKE_TOKEN_REQUIRED");
  }

  const authHeaders = {
    Authorization: `Bearer ${token}`
  };

  const root = `${baseUrl}/internal/entry/${ownerType}/${slug}`;

  const metadata = await requestRaw(root, authHeaders);
  assert(metadata.status === 200, "ENTRY_METADATA_STATUS_INVALID", metadata.text);
  assert(metadata.json?.ok === true, "ENTRY_METADATA_OK_FALSE", metadata.text);
  assert(metadata.json?.owner_type === ownerType, "ENTRY_METADATA_OWNER_TYPE_INVALID", metadata.text);
  assert(metadata.json?.canonical_slug === slug, "ENTRY_METADATA_SLUG_INVALID", metadata.text);

  const qrPayload = await requestRaw(`${root}/qr-payload`, authHeaders);
  assert(qrPayload.status === 200, "ENTRY_QR_PAYLOAD_STATUS_INVALID", qrPayload.text);
  assert(qrPayload.json?.ok === true, "ENTRY_QR_PAYLOAD_OK_FALSE", qrPayload.text);
  assert(qrPayload.json?.qr_payload === metadata.json?.public_absolute_url, "ENTRY_QR_PAYLOAD_MISMATCH", qrPayload.text);

  const qrPng = await requestRaw(`${root}/qr.png`, authHeaders);
  assert(qrPng.status === 200, "ENTRY_QR_PNG_STATUS_INVALID", qrPng.text);
  assert((qrPng.headers["content-type"] || "").includes("image/png"), "ENTRY_QR_PNG_CONTENT_TYPE_INVALID", String(qrPng.headers["content-type"] || ""));
  assert(Number(qrPng.buffer?.length || 0) > 0, "ENTRY_QR_PNG_EMPTY");
  assert((qrPng.headers["x-totem-qr-payload"] || "") === metadata.json?.public_absolute_url, "ENTRY_QR_PNG_HEADER_PAYLOAD_MISMATCH");

  const authSnapshot = await requestRaw(`${root}/auth`);
  assert(authSnapshot.status === 200, "ENTRY_AUTH_STATUS_INVALID", authSnapshot.text);
  assert(authSnapshot.json?.auth_required_for_cabinet === true, "ENTRY_AUTH_REQUIRED_FLAG_INVALID", authSnapshot.text);

  const cabinetWithoutAuth = await requestRaw(`${root}/cabinet`);
  assert(cabinetWithoutAuth.status === 403, "ENTRY_CABINET_WITHOUT_AUTH_STATUS_INVALID", cabinetWithoutAuth.text);
  assert(cabinetWithoutAuth.json?.code === "AUTH_REQUIRED", "ENTRY_CABINET_WITHOUT_AUTH_CODE_INVALID", cabinetWithoutAuth.text);

  const cabinetWithAuth = await requestRaw(`${root}/cabinet`, authHeaders);
  assert(cabinetWithAuth.status === 200, "ENTRY_CABINET_WITH_AUTH_STATUS_INVALID", cabinetWithAuth.text);
  assert(cabinetWithAuth.json?.ok === true, "ENTRY_CABINET_WITH_AUTH_OK_FALSE", cabinetWithAuth.text);

  const validation = await requestRaw(`${root}/validate`, authHeaders);
  assert(validation.status === 200, "ENTRY_VALIDATE_STATUS_INVALID", validation.text);
  assert(validation.json?.contract_shape_ok === true, "ENTRY_VALIDATE_CONTRACT_SHAPE_INVALID", validation.text);
  assert(validation.json?.expected_http?.cabinet_status_without_auth === 403, "ENTRY_VALIDATE_CABINET_WITHOUT_AUTH_EXPECTATION_INVALID", validation.text);
  assert(validation.json?.expected_http?.cabinet_status_with_auth === 200, "ENTRY_VALIDATE_CABINET_WITH_AUTH_EXPECTATION_INVALID", validation.text);

  const handoff = await requestRaw(`${root}/handoff`, authHeaders);
  assert(handoff.status === 200, "ENTRY_HANDOFF_STATUS_INVALID", handoff.text);
  assert(handoff.json?.status === "handoff_ready", "ENTRY_HANDOFF_STATUS_FIELD_INVALID", handoff.text);
  assert(handoff.json?.contract?.public_absolute_url === metadata.json?.public_absolute_url, "ENTRY_HANDOFF_PUBLIC_URL_MISMATCH", handoff.text);

  console.log("ENTRY_LIVE_SMOKE_TEST: OK");
  console.log(`OWNER=${ownerType}/${slug}`);
  console.log(`BASE_URL=${baseUrl}`);
  console.log(`PUBLIC=${metadata.json.public_absolute_url}`);
})();
