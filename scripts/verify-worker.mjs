import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = path.resolve(import.meta.dirname, "..");
const entry = path.join(root, "dist", "server", "index.js");
const assetsRoot = path.join(root, "dist", "client");
const worker = (await import(pathToFileURL(entry).href)).default;
assert.equal(typeof worker.fetch, "function", "The production Worker exports fetch");
const tasks = [];
const env = { ASSETS: { async fetch(request) {
  const assetPath = path.resolve(assetsRoot, `.${new URL(request.url).pathname}`);
  if (!assetPath.startsWith(assetsRoot + path.sep)) return new Response(null, { status: 404 });
  try {
    const bytes = await fs.readFile(assetPath);
    const type = assetPath.endsWith(".css") ? "text/css" : assetPath.endsWith(".js") ? "text/javascript" : assetPath.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
    return new Response(bytes, { headers: { "Content-Type": type } });
  } catch { return new Response(null, { status: 404 }); }
} } };
const ctx = { props: {}, waitUntil(promise) { tasks.push(promise); }, passThroughOnException() {} };
const call = async (pathname, body, raw = false) => {
  const request = new Request(`https://curveguard.test${pathname}`, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: raw ? body : JSON.stringify(body) });
  // Cloudflare serves existing assets before dispatching the Worker.
  if (body === undefined && pathname !== "/") { const asset = await env.ASSETS.fetch(request); if (asset.status === 200) return asset; }
  return worker.fetch(request, env, ctx);
};
const home = await call("/");
assert.equal(home.status, 200);
const html = await home.text();
assert.match(html, /lang="en"/);
for (const text of ["Design liquidity before you launch", "Curve studio", "Graduation", "On-chain", "Launch", "Report", "Source code"]) assert.ok(html.includes(text), `SSR contains ${text}`);
assert.doesNotMatch(html, /[\u3400-\u9FFF]/, "Delivered interface and modeled payload are English");
const input = { quoteToken: "USDC", totalSupply: 1000000000, initialMarketCap: 25000, migrationMarketCap: 250000, targetQuoteReserve: 50000, orderSize: 500, impactTargetPercent: 1, feeBps: 100, graduatedFeeBps: 30, compoundingPercent: 70, lockedLiquidityPercent: 90 };
const response = await call("/api/design", input);
assert.equal(response.status, 200);
assert.equal(response.headers.get("Cache-Control"), "no-store");
const design = await response.json();
assert.equal(design.selected.sdkValid, true);
assert.equal(design.candidatesTested, 15);
assert.ok(design.selected.worstImpact < 1);
const quoteResponse = await call("/api/quote", { input, weights: design.selected.weights, progress: 50, direction: "buy", amount: 500, slippageBps: 100 });
assert.equal(quoteResponse.status, 200);
const quote = await quoteResponse.json();
assert.ok(quote.amountOut > 0 && quote.minimumOut < quote.amountOut);
assert.equal(quote.fee, 5);
assert.equal((await call("/api/design", { ...input, feeBps: 1 })).status, 400);
assert.equal((await call("/api/design", { ...input, extra: true })).status, 400);
assert.equal((await call("/api/design", "{bad json}", true)).status, 400);
assert.equal((await call("/api/design", " ".repeat(8001), true)).status, 413);
assert.equal((await call("/api/quote", { input, weights: design.selected.weights, progress: 100, direction: "buy", amount: 1, slippageBps: 100 })).status, 400);
const cssPath = html.match(/href="([^\"]+\.css)"/)?.[1];
assert.ok(cssPath, "The homepage links its built stylesheet");
assert.equal((await call(cssPath)).status, 200);
const source = await call("/downloads/curveguard-launch-source.zip");
assert.equal(source.status, 200);
assert.ok((await source.arrayBuffer()).byteLength > 10000);
await Promise.allSettled(tasks);
console.log(JSON.stringify({ status: "passed", runtime: "built Worker fetch handler under Node", htmlBytes: Buffer.byteLength(html), coverage: ["English SSR", "default SDK design", "design HTTP endpoint", "exact-in quote HTTP endpoint", "strict fields", "invalid JSON", "body limits", "graduation guard", "built CSS", "full source download"] }));
