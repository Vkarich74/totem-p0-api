// US-PAY-C11 final cross-repository acceptance.
// Runs real Vite-built SDK in Chromium against real Backend C11 router,
// production-equivalent token check and disposable PostgreSQL 17.
// No production customers, Odoo, real Stripe transactions, or payments.
import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "../sdk/node_modules/playwright/index.mjs";

const browserBase = "http://127.0.0.1:4173";
const apiBase = "http://127.0.0.1:4123";

async function getJson(path) {
  const res = await fetch(apiBase + path);
  return { status: res.status, body: await res.json() };
}

test("US-PAY-C11 final SDK + Backend + PostgreSQL 17 acceptance", async t => {
  const health = await getJson("/stage/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.mode, "synthetic-only");

  await t.test("real cabinet tokens: valid, revoked, purpose and client isolation", async () => {
    const base = "/public/clients/55/";
    assert.equal((await getJson(base+"synthetic-us-55/us-pay-c11/500")).status,200);
    assert.equal((await getJson(base+"synthetic-revoked-55/us-pay-c11/500")).status,403);
    assert.equal((await getJson(base+"synthetic-wrong-purpose-55/us-pay-c11/500")).status,403);
    assert.equal((await getJson(base+"bad-token/us-pay-c11/500")).status,403);
    assert.equal((await getJson("/public/clients/56/synthetic-kg-56/us-pay-c11/500")).status,404);
    assert.equal((await getJson("/public/clients/56/synthetic-kg-56/us-pay-c11/502")).status,404);
    assert.equal((await getJson("/public/clients/57/synthetic-kz-57/us-pay-c11/503")).status,404);
  });

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    await t.test("desktop: actual SDK renders exact cents, both owners, true booking/payment states", async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const pageErrors = [];
      page.on("pageerror", error => pageErrors.push(String(error?.message || error)));
      try {
        await page.goto(browserBase+"/#/client/55/synthetic-us-55", { waitUntil: "domcontentloaded" });
        await page.getByText("$10.50").first().waitFor({ timeout: 20000 });
        await page.getByText("$0.01").first().waitFor({ timeout: 10000 });
        const display = await page.locator("body").innerText();
        assert.match(display, /\$10\.50/);
        assert.match(display, /\$0\.01/);
        assert.match(display, /Reserved/);
        assert.match(display, /Confirmed/);
        assert.match(display, /Payment recipient: Salon — SYNTHETIC_US_A/);
        assert.match(display, /Payment recipient: Professional — SYNTHETIC_MASTER_US/);
        assert.match(display, /Payment status unavailable/);
        assert.doesNotMatch(display, /\$9,999\.00|Payment received|Payment confirmed|Checkout|Pay now/);
        assert.deepEqual(pageErrors, []);
      } finally {
        await page.close();
      }
    });

    await t.test("mobile 360px: no missing US recipient or silent legacy money", async () => {
      const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
      try {
        await page.goto(browserBase+"/#/client/55/synthetic-us-55", { waitUntil: "domcontentloaded" });
        await page.getByText("$10.50").first().waitFor({ timeout: 20000 });
        const display = await page.locator("body").innerText();
        assert.match(display, /Payment recipient: Salon/);
        assert.match(display, /Payment recipient: Professional/);
        assert.doesNotMatch(display, /\$9,999\.00|Payment received|Pay now/);
      } finally {
        await page.close();
      }
    });

    await t.test("failed C11 HTTP must fail closed in SDK without returning old price", async () => {
      const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      await page.route("**/us-pay-c11/*", route => route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"ok":false,"error":"US_PAY_C11_READ_UNAVAILABLE"}',
      }));
      try {
        await page.goto(browserBase+"/#/client/55/synthetic-us-55", { waitUntil: "domcontentloaded" });
        await page.getByText("Price unavailable").first().waitFor({ timeout: 20000 });
        const display=await page.locator("body").innerText();
        assert.match(display, /Payment recipient unavailable/);
        assert.match(display, /Payment status unavailable/);
        assert.doesNotMatch(display, /\$9,999\.00|\$10\.50|Payment received/);
      } finally {
        await page.close();
      }
    });

    await t.test("revoked token cannot view client dashboard", async () => {
      const page = await browser.newPage();
      try {
        await page.goto(browserBase+"/#/client/55/synthetic-revoked-55", { waitUntil: "domcontentloaded" });
        await page.getByText("INVALID_CLIENT_TOKEN").first().waitFor({ timeout: 15000 });
        const display = await page.locator("body").innerText();
        assert.doesNotMatch(display, /\$10\.50|SYNTHETIC_US_A|Payment recipient:/);
      } finally {
        await page.close();
      }
    });

    await t.test("KG/KZ client cabinets never invoke US C11", async () => {
      for (const [id, token] of [[56, "synthetic-kg-56"], [57, "synthetic-kz-57"]]) {
        const page = await browser.newPage();
        let usRequests=0;
        page.on("request",req=>{
          if (req.url().includes("/us-pay-c11/")) usRequests++;
        });
        try {
          await page.goto(`${browserBase}/#/client/${id}/${token}`, { waitUntil: "domcontentloaded" });
          await page.getByText("9 999 сом").first().waitFor({ timeout: 20000 });
          assert.equal(usRequests,0);
        } finally {
          await page.close();
        }
      }
    });
  } finally {
    await browser.close();
  }
  console.log("US_PAY_C11_FINAL_CROSS_REPO_STAGING_ACCEPTANCE_PASS");
});
