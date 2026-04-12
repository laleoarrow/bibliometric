#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const DEFAULT_BROWSER_URL = 'http://127.0.0.1:9223';
const DEFAULT_OUTPUT_DIR = './data/bibliometric_raw/txt';
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_CONTENT = 'Full Record and Cited References';
const DEFAULT_PLAIN_TEXT_URL = null;

function parseArgs(argv) {
  const args = {
    browserUrl: DEFAULT_BROWSER_URL,
    outputDir: DEFAULT_OUTPUT_DIR,
    batchSize: DEFAULT_BATCH_SIZE,
    content: DEFAULT_CONTENT,
    resume: true,
    start: 1,
    end: null,
    url: DEFAULT_PLAIN_TEXT_URL,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--browser-url') { args.browserUrl = next; i += 1; continue; }
    if (token === '--output-dir') { args.outputDir = next; i += 1; continue; }
    if (token === '--batch-size') { args.batchSize = Number(next); i += 1; continue; }
    if (token === '--content') { args.content = next; i += 1; continue; }
    if (token === '--start') { args.start = Number(next); i += 1; continue; }
    if (token === '--end') { args.end = Number(next); i += 1; continue; }
    if (token === '--url') { args.url = next; i += 1; continue; }
    if (token === '--no-resume') { args.resume = false; continue; }
    if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  if (!Number.isInteger(args.batchSize) || args.batchSize <= 0) throw new Error('batch-size must be a positive integer');
  if (!Number.isInteger(args.start) || args.start <= 0) throw new Error('start must be a positive integer');
  if (args.end !== null && (!Number.isInteger(args.end) || args.end < args.start)) throw new Error('end must be null or an integer >= start');
  return args;
}

function printHelp() {
  console.log(`Usage: node export_wos_plaintext.mjs [options]

` +
    `Options:
` +
    `  --url <summary-url>        Optional WoS summary URL to use
` +
    `  --browser-url <url>        Edge remote debugging endpoint (default: ${DEFAULT_BROWSER_URL})
` +
    `  --output-dir <dir>         Output directory for renamed txt files (default: ${DEFAULT_OUTPUT_DIR})
` +
    `  --batch-size <n>           Requested export batch size (default: ${DEFAULT_BATCH_SIZE})
` +
    `  --start <n>                Starting record number (default: 1)
` +
    `  --end <n>                  Optional ending record number
` +
    `  --content <label>          WoS record content option (default: ${DEFAULT_CONTENT})
` +
    `  --no-resume                Fail if a target range file already exists
`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseNumber(raw) {
  return Number(String(raw).replace(/,/g, '').trim());
}

function parseRangeLimit(text) {
  const match = String(text).match(/No more than\s+([0-9,]+)\s+records at a time/i);
  return match ? parseNumber(match[1]) : null;
}

function parseTotalFromTitle(title) {
  const match = String(title).match(/[–-]\s*([0-9,]+)\s*[–-]\s*Web of Science/i);
  return match ? parseNumber(match[1]) : null;
}

function parseTotalFromPageBar(text) {
  const match = String(text).match(/(?:^|\n)\s*\d+\/([0-9,]+)(?:\n|$)/);
  return match ? parseNumber(match[1]) : null;
}

function buildTargetName(start, end) {
  return `${start}-${end}.txt`;
}

function buildScreenshotName(start, end) {
  return `${start}-${end}.png`;
}

function buildManifestPath(outputDir) {
  return path.join(outputDir, 'export_manifest.csv');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function connectWs(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 0;
    const pending = new Map();
    ws.onmessage = evt => {
      const data = JSON.parse(evt.data.toString());
      if (data.id && pending.has(data.id)) {
        const { resolve: resolvePending, reject: rejectPending } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) rejectPending(new Error(JSON.stringify(data.error)));
        else resolvePending(data.result);
      }
    };
    ws.onopen = () => {
      resolve({
        ws,
        send(method, params = {}) {
          return new Promise((resolveSend, rejectSend) => {
            const id = ++msgId;
            pending.set(id, { resolve: resolveSend, reject: rejectSend });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        close() { ws.close(); },
      });
    };
    ws.onerror = reject;
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${url} -> ${response.status}`);
  return response.json();
}

function deriveSummaryUrl(url) {
  const match = String(url).match(/\/analyze-results\/([^/?#]+)/);
  return match ? `https://www.webofscience.com/wos/woscc/summary/${match[1]}/relevance/1` : null;
}

async function findOrCreateSummaryTab(browserClient, browserUrl, requestedUrl) {
  const tabs = await fetchJson(`${browserUrl}/json/list`);
  let tab = requestedUrl ? tabs.find(item => item.url === requestedUrl) : tabs.find(item => item.url.includes('/summary/'));
  if (tab) return tab;

  const analyzeTab = tabs.find(item => item.url.includes('/analyze-results/'));
  const fallbackUrl = requestedUrl || deriveSummaryUrl(analyzeTab?.url || '');
  if (!fallbackUrl) {
    throw new Error('No WoS summary tab found. Ask the user to open the searched WoS result page in Edge first.');
  }

  await browserClient.send('Target.createTarget', { url: fallbackUrl });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(500);
    const freshTabs = await fetchJson(`${browserUrl}/json/list`);
    tab = freshTabs.find(item => item.url === fallbackUrl);
    if (tab) return tab;
  }
  throw new Error('Created a WoS summary tab request, but could not locate the tab.');
}

async function evaluate(pageClient, expression) {
  const result = await pageClient.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result?.value;
}

async function click(pageClient, expression) {
  const ok = await evaluate(pageClient, `(() => { const el = ${expression}; if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error(`Failed to click element: ${expression}`);
}

async function ensureSummaryReady(pageClient, summaryUrl) {
  const currentUrl = await evaluate(pageClient, 'location.href');
  if (currentUrl !== summaryUrl) {
    await evaluate(pageClient, `location.href = ${JSON.stringify(summaryUrl)}`);
    await sleep(2500);
  }
  const state = await evaluate(pageClient, `(() => ({
    title: document.title,
    url: location.href,
    body: document.body.innerText.slice(0, 5000)
  }))()`);
  const haystack = `${state.title}
${state.body}`;
  if (/sign in|login|统一身份认证|access denied/i.test(haystack) && !/Web of Science Core Collection/i.test(state.title)) {
    throw new Error('WoS authentication is missing or expired in Edge. Ask the user to log in and open the result page again.');
  }
  if (/captcha|verify you are human|hcaptcha/i.test(haystack)) {
    throw new Error('WoS presented a captcha or challenge. Ask the user to clear it in Edge, then rerun.');
  }
  if (!state.url.includes('/summary/')) {
    throw new Error(`Expected a WoS summary page, found: ${state.url}`);
  }
  return state;
}

async function openPlainTextOverlay(pageClient) {
  await click(pageClient, `document.querySelector('#export-trigger-btn')`);
  await sleep(500);
  await click(pageClient, `document.querySelector('#exportToFieldTaggedButton')`);
  await sleep(800);
  const title = await evaluate(pageClient, `document.querySelector('app-export-overlay h1')?.innerText || ''`);
  if (!/Plain Text File/i.test(title)) {
    throw new Error(`Expected plain-text export overlay, found: ${title || 'missing overlay'}`);
  }
  return { title };
}

async function readLiveLimit(pageClient) {
  const limitText = await evaluate(pageClient, `(() => [...document.querySelectorAll('app-export-overlay *')].map(el => (el.innerText || '').trim()).find(t => /No more than .* records at a time/i.test(t)) || '')()`);
  const liveLimit = parseRangeLimit(limitText);
  if (!liveLimit) throw new Error('Could not read the live WoS export limit from the overlay.');
  return { liveLimit, limitText };
}

async function setRange(pageClient, start, end) {
  const radioState = await evaluate(pageClient, `(() => {
    const rangeInput = document.querySelector('#radio3-input');
    const rangeRadio = document.querySelector('mat-radio-button#radio3');
    const allInput = document.querySelector('#mat-radio-3-input');
    if (rangeInput) rangeInput.click();
    else if (rangeRadio) rangeRadio.click();
    return {
      allChecked: !!allInput?.checked,
      rangeChecked: !!rangeInput?.checked,
    };
  })()`);
  await sleep(300);
  if (!radioState.rangeChecked || radioState.allChecked) {
    throw new Error('Failed to switch WoS export to "Records from" mode.');
  }
  const values = await evaluate(pageClient, `(() => {
    const from = document.querySelector('input[name="markFrom"]');
    const to = document.querySelector('input[name="markTo"]');
    for (const [el, value] of [[from, ${JSON.stringify(String(start))}], [to, ${JSON.stringify(String(end))}]]) {
      if (!el) continue;
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    }
    return {
      from: from?.value || '',
      to: to?.value || '',
      allChecked: !!document.querySelector('#mat-radio-3-input')?.checked,
      rangeChecked: !!document.querySelector('#radio3-input')?.checked,
      exportDisabled: !!document.querySelector('#exportButton')?.disabled,
    };
  })()`);
  if (
    String(values.from) !== String(start) ||
    String(values.to) !== String(end) ||
    !values.rangeChecked ||
    values.allChecked ||
    values.exportDisabled
  ) {
    throw new Error(`Failed to set export range to ${start}-${end}; got ${values.from}-${values.to}`);
  }
}

async function setContent(pageClient, contentLabel) {
  const current = await evaluate(pageClient, `document.querySelector('app-export-overlay wos-select button.dropdown')?.innerText || ''`);
  if (current.trim() === contentLabel) return current.trim();
  await click(pageClient, `document.querySelector('app-export-overlay wos-select button.dropdown')`);
  await sleep(500);
  const selected = await evaluate(pageClient, `(() => {
    const option = [...document.querySelectorAll('app-export-overlay [role="option"]')].find(el => (el.innerText || '').trim() === ${JSON.stringify(contentLabel)});
    if (!option) return null;
    option.click();
    return option.innerText.trim();
  })()`);
  if (selected !== contentLabel) throw new Error(`Could not select content option: ${contentLabel}`);
  await sleep(400);
  const after = await evaluate(pageClient, `document.querySelector('app-export-overlay wos-select button.dropdown')?.innerText || ''`);
  if (after.trim() !== contentLabel) {
    throw new Error(`Content option did not stick; expected ${contentLabel}, found ${after.trim()}`);
  }
  return after.trim();
}

async function waitForDownload(dir, seenBefore, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const names = fs.readdirSync(dir);
    const partial = names.filter(name => name.endsWith('.crdownload'));
    const fresh = names.filter(name => !seenBefore.has(name) && name.toLowerCase().endsWith('.txt') && !name.endsWith('.crdownload'));
    if (fresh.length > 0 && partial.length === 0) {
      return path.join(dir, fresh[0]);
    }
    await sleep(1000);
  }
  throw new Error('Timed out waiting for the WoS download to finish.');
}

function loadExistingManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return [];
  const lines = fs.readFileSync(manifestPath, 'utf8').trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  return lines.slice(1).map(line => line.split(','));
}

function countTaggedRecords(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  let ptCount = 0;
  let utCount = 0;
  for (const line of lines) {
    if (line.startsWith('PT ')) ptCount += 1;
    if (line.startsWith('UT ')) utCount += 1;
  }
  return { ptCount, utCount };
}

function appendManifestRow(manifestPath, row) {
  const header = 'start,end,filename,screenshot,content,records_total,batch_size,live_limit,expected_records,actual_records,downloaded_at,size_bytes\n';
  if (!fs.existsSync(manifestPath)) fs.writeFileSync(manifestPath, header, 'utf8');
  fs.appendFileSync(manifestPath, [
    row.start,
    row.end,
    row.filename,
    row.screenshot,
    row.content,
    row.recordsTotal,
    row.batchSize,
    row.liveLimit,
    row.expectedRecords,
    row.actualRecords,
    row.downloadedAt,
    row.sizeBytes,
  ].join(',') + '\n', 'utf8');
}

async function saveOverlayScreenshot(pageClient, outputPath) {
  const shot = await pageClient.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outputPath, Buffer.from(shot.data, 'base64'));
}

function planRanges(start, end, batchSize) {
  const ranges = [];
  for (let current = start; current <= end; current += batchSize) {
    const rangeEnd = Math.min(end, current + batchSize - 1);
    ranges.push({ start: current, end: rangeEnd });
  }
  return ranges;
}

async function main() {
  const args = parseArgs(process.argv);
  const outputDir = path.resolve(process.cwd(), args.outputDir);
  ensureDir(outputDir);
  const manifestPath = buildManifestPath(outputDir);

  const version = await fetchJson(`${args.browserUrl}/json/version`);
  const browserClient = await connectWs(version.webSocketDebuggerUrl);
  await browserClient.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: outputDir,
    eventsEnabled: true,
  });

  const tab = await findOrCreateSummaryTab(browserClient, args.browserUrl, args.url);
  const pageClient = await connectWs(tab.webSocketDebuggerUrl);
  await pageClient.send('Page.enable');
  await pageClient.send('Runtime.enable');
  const summaryState = await ensureSummaryReady(pageClient, args.url || tab.url);
  const pageBarText = await evaluate(pageClient, `document.querySelector('#snRecListTop')?.innerText || ''`);
  const recordsTotal = parseTotalFromTitle(summaryState.title) || parseTotalFromPageBar(pageBarText);
  if (!recordsTotal) throw new Error(`Could not parse total records from title or page bar: ${summaryState.title}`);

  const requestedEnd = args.end ?? recordsTotal;
  // Default behavior is full coverage of the current result set unless the user explicitly passes --end.
  const effectiveEnd = Math.min(requestedEnd, recordsTotal);
  if (effectiveEnd < args.start) throw new Error(`Requested end ${effectiveEnd} is before start ${args.start}`);

  await openPlainTextOverlay(pageClient);
  await setContent(pageClient, args.content);
  const overlayMeta = await readLiveLimit(pageClient);
  if (args.batchSize > overlayMeta.liveLimit) {
    throw new Error(`Requested batch size ${args.batchSize} exceeds live WoS limit ${overlayMeta.liveLimit}`);
  }
  await click(pageClient, `document.querySelector('app-export-overlay button[aria-label="Close"]') || document.querySelector('app-export-overlay button')`);
  await sleep(500);

  const ranges = planRanges(args.start, effectiveEnd, args.batchSize);
  for (const range of ranges) {
    const targetName = buildTargetName(range.start, range.end);
    const screenshotName = buildScreenshotName(range.start, range.end);
    const targetPath = path.join(outputDir, targetName);
    const screenshotPath = path.join(outputDir, screenshotName);
    if (fs.existsSync(targetPath)) {
      if (args.resume) {
        console.log(`skip ${targetName}`);
        continue;
      }
      throw new Error(`Target file already exists: ${targetPath}`);
    }

    await ensureSummaryReady(pageClient, args.url || summaryState.url);
    await openPlainTextOverlay(pageClient);
    await setContent(pageClient, args.content);
    const { liveLimit } = await readLiveLimit(pageClient);
    if (args.batchSize > liveLimit) {
      throw new Error(`Requested batch size ${args.batchSize} exceeds live WoS limit ${liveLimit}`);
    }
    await setRange(pageClient, range.start, range.end);
    await saveOverlayScreenshot(pageClient, screenshotPath);
    const beforeNames = new Set(fs.readdirSync(outputDir));
    await click(pageClient, `document.querySelector('#exportButton')`);
    const downloadedPath = await waitForDownload(outputDir, beforeNames);
    const expectedRecords = range.end - range.start + 1;
    const counts = countTaggedRecords(downloadedPath);
    if (counts.ptCount !== expectedRecords || counts.utCount !== expectedRecords) {
      fs.rmSync(downloadedPath, { force: true });
      throw new Error(`Downloaded batch ${range.start}-${range.end} contains PT=${counts.ptCount}, UT=${counts.utCount}; expected ${expectedRecords}.`);
    }
    fs.renameSync(downloadedPath, targetPath);
    const stat = fs.statSync(targetPath);
    appendManifestRow(manifestPath, {
      start: range.start,
      end: range.end,
      filename: targetName,
      screenshot: screenshotName,
      content: args.content,
      recordsTotal,
      batchSize: args.batchSize,
      liveLimit,
      expectedRecords,
      actualRecords: counts.ptCount,
      downloadedAt: new Date().toISOString(),
      sizeBytes: stat.size,
    });
    console.log(`done ${targetName}`);
  }

  pageClient.close();
  browserClient.close();
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
