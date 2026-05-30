#!/usr/bin/env node
import crypto from 'node:crypto';

const baseUrl = (process.env.SANAD_BASE_URL || process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
const metricsToken = process.env.METRICS_BEARER_TOKEN || process.env.METRICS_TOKEN || '';
const strict = process.env.LIVE_ACCEPTANCE_STRICT === 'true';

function fail(message, detail = undefined) {
  console.error(`LIVE_ACCEPTANCE_FAILED: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

async function get(path, headers = {}) {
  const url = `${baseUrl}${path}`;
  const started = Date.now();
  const res = await fetch(url, { headers, redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, text, ms: Date.now() - started };
}

if (!baseUrl) fail('Set SANAD_BASE_URL or PUBLIC_APP_URL, e.g. https://app.example.com');
if (!baseUrl.startsWith('https://') && strict) fail('Strict live acceptance requires HTTPS base URL.');

const live = await get('/health/live').catch(err => fail('/health/live unreachable', err.message));
if (live.status !== 200) fail(`/health/live returned ${live.status}`, live.text);

const ready = await get('/health/ready').catch(err => fail('/health/ready unreachable', err.message));
if (ready.status !== 200) fail(`/health/ready returned ${ready.status}`, ready.text);
let readyJson;
try { readyJson = JSON.parse(ready.text); } catch { fail('/health/ready did not return JSON', ready.text); }
if (!readyJson.ok) fail('/health/ready returned ok=false', ready.text);

const loginPage = await get('/login').catch(err => fail('/login unreachable', err.message));
if (loginPage.status !== 200 || !loginPage.text.includes('سند ذكي')) fail('/login page is not serving the UI correctly', loginPage.text.slice(0, 300));

if (metricsToken) {
  const metrics = await get('/metrics', { authorization: `Bearer ${metricsToken}` }).catch(err => fail('/metrics unreachable', err.message));
  if (metrics.status !== 200) fail(`/metrics returned ${metrics.status}`, metrics.text);
  if (!/sanad_http_requests_total|sanad_ready/.test(metrics.text)) fail('/metrics does not expose expected Sanad metrics', metrics.text.slice(0, 500));
} else if (strict) {
  fail('Strict live acceptance requires METRICS_BEARER_TOKEN to verify /metrics.');
}

const marker = crypto.createHash('sha256').update(`${baseUrl}|${Date.now()}`).digest('hex').slice(0, 12);
console.log(JSON.stringify({
  ok: true,
  code: 'LIVE_ACCEPTANCE_PASSED',
  baseUrl,
  liveMs: live.ms,
  readyMs: ready.ms,
  metricsChecked: Boolean(metricsToken),
  marker
}, null, 2));
