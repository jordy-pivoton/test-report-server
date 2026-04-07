import express from "express";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import https from "https";
import { createRequire } from "module";
import { generateDevHttpsPems } from "./httpsDevCert.js";

const require = createRequire(import.meta.url);
const app = express();

function getTraceViewerDir(): string {
  try {
    const pwPath = require.resolve("playwright-core/package.json");
    return path.join(path.dirname(pwPath), "lib", "vite", "traceViewer");
  } catch {
    return path.join(process.cwd(), "node_modules", "playwright-core", "lib", "vite", "traceViewer");
  }
}
const TRACE_VIEWER_DIR = getTraceViewerDir();

const REPORTS_ROOT = path.resolve(process.env.REPORTS_ROOT ?? "R:/");
const PORT = Number(process.env.PORT ?? 3000);
const USE_HTTPS =
  process.env.USE_HTTPS === "1" ||
  process.env.USE_HTTPS === "true" ||
  process.env.USE_HTTPS === "yes";
const HTTPS_PORT = Number(process.env.HTTPS_PORT ?? 3443);
const SSL_CERT_PATH = process.env.SSL_CERT_PATH ?? path.resolve("./cert/cert.pem");
const SSL_KEY_PATH = process.env.SSL_KEY_PATH ?? path.resolve("./cert/key.pem");
const BASE_URL = process.env.BASE_URL ?? null;

const ALLURE_DIR_NAME = "allure-reports";

function parseHttpsOptions(): { key: string; cert: string } | null {
  if (!USE_HTTPS) return null;
  const certPath = path.resolve(SSL_CERT_PATH);
  const keyPath = path.resolve(SSL_KEY_PATH);
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath, "utf8"),
      key: fs.readFileSync(keyPath, "utf8"),
    };
  }
  const certDir = path.dirname(certPath);
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }
  const pems = generateDevHttpsPems();
  fs.writeFileSync(certPath, pems.cert, "utf8");
  fs.writeFileSync(keyPath, pems.key, "utf8");
  console.log(`Generated self-signed certificate in ${certDir}`);
  return pems;
}

type RunItem = {
  id: string;
  testSoort: string;
  hasAllure: boolean;
  traceFiles: string[];
  allureUrl: string | null;
  tracesBaseUrl: string;
};

type RunGroup = {
  testSoort: string;
  runs: RunItem[];
};

function isSafeRunId(runId: string) {
  return /^[a-zA-Z0-9._-]+$/.test(runId);
}

function isSafeTestSoort(testSoort: string) {
  return /^[a-zA-Z0-9._-]+$/.test(testSoort);
}

async function getRuns(): Promise<RunGroup[]> {
  if (!fs.existsSync(REPORTS_ROOT)) return [];

  const entries = await fsp.readdir(REPORTS_ROOT, { withFileTypes: true });
  const groupsByTestSoort = new Map<string, RunItem[]>();

  function addRun(testSoort: string, runId: string, runPath: string) {
    if (!isSafeTestSoort(testSoort) || !isSafeRunId(runId)) return;

    const allureIndex = path.join(runPath, ALLURE_DIR_NAME, "index.html");
    const hasAllure = fs.existsSync(allureIndex);

    const tracesDir = path.join(runPath, "traces");
    let traceFiles: string[] = [];

    if (fs.existsSync(tracesDir) && fs.statSync(tracesDir).isDirectory()) {
      const files = fs.readdirSync(tracesDir);
      traceFiles = files.filter((f) => f.endsWith(".zip") || f.endsWith(".trace"));
    }

    const run: RunItem = {
      id: runId,
      testSoort,
      hasAllure,
      traceFiles,
      allureUrl: hasAllure ? `/runs/${encodeURIComponent(testSoort)}/${encodeURIComponent(runId)}/allure/` : null,
      tracesBaseUrl: `/runs/${encodeURIComponent(testSoort)}/${encodeURIComponent(runId)}/traces/`,
    };

    const list = groupsByTestSoort.get(testSoort) ?? [];
    list.push(run);
    groupsByTestSoort.set(testSoort, list);
  }

  for (const e of entries) {
    if (!e.isDirectory()) continue;

    const childPath = path.join(REPORTS_ROOT, e.name);
    const hasAllureHere = fs.existsSync(path.join(childPath, ALLURE_DIR_NAME, "index.html"));
    const tracesDir = path.join(childPath, "traces");
    const hasTracesHere = fs.existsSync(tracesDir) && fs.statSync(tracesDir).isDirectory();

    if (hasAllureHere || hasTracesHere) {
      addRun("overig", e.name, childPath);
    } else {
      if (!isSafeTestSoort(e.name)) continue;

      let subEntries: fs.Dirent[];
      try {
        subEntries = await fsp.readdir(childPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const sub of subEntries) {
        if (!sub.isDirectory()) continue;
        const runPath = path.join(childPath, sub.name);
        addRun(e.name, sub.name, runPath);
      }
    }
  }

  const result: RunGroup[] = [];
  for (const [testSoort, runs] of groupsByTestSoort) {
    runs.sort((a, b) => (a.id < b.id ? 1 : -1));
    result.push({ testSoort, runs });
  }
  result.sort((a, b) => a.testSoort.localeCompare(b.testSoort));
  return result;
}

if (fs.existsSync(TRACE_VIEWER_DIR)) {
  app.use("/trace-viewer", express.static(TRACE_VIEWER_DIR));
}

app.use("/runs/:testSoort/:runId/allure", (req, res, next) => {
  const { testSoort, runId } = req.params;
  if (!isSafeTestSoort(testSoort) || !isSafeRunId(runId)) {
    return res.status(400).send("Invalid testSoort or runId");
  }

  const dir = path.join(REPORTS_ROOT, testSoort, runId, ALLURE_DIR_NAME);
  return express.static(dir)(req, res, next);
});

app.options("/runs/:testSoort/:runId/traces/:filename", (req, res) => {
  const { testSoort, runId } = req.params;
  if (!isSafeTestSoort(testSoort) || !isSafeRunId(runId)) {
    return res.status(400).send("Invalid testSoort or runId");
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.sendStatus(204);
});

app.get("/runs/:testSoort/:runId/traces/view", (req, res) => {
  const { testSoort, runId } = req.params;
  const file = req.query.file;

  if (!isSafeTestSoort(testSoort) || !isSafeRunId(runId) || typeof file !== "string" || !file) {
    return res.status(400).send("Missing or invalid testSoort, runId or file");
  }

  const origin =
    BASE_URL ??
    (USE_HTTPS
      ? `https://${req.get("host") ?? `localhost:${HTTPS_PORT}`}`
      : `${req.protocol}://${req.get("host")}`);

  const traceUrl = `${origin}/runs/${encodeURIComponent(testSoort)}/${encodeURIComponent(runId)}/traces/${encodeURIComponent(file)}`;
  const viewerPath = `/trace-viewer/index.html?trace=${encodeURIComponent(traceUrl)}`;
  res.redirect(302, viewerPath);
});

app.use("/runs/:testSoort/:runId/traces", (req, res, next) => {
  const { testSoort, runId } = req.params;
  if (!isSafeTestSoort(testSoort) || !isSafeRunId(runId)) {
    return res.status(400).send("Invalid testSoort or runId");
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  const dir = path.join(REPORTS_ROOT, testSoort, runId, "traces");
  return express.static(dir)(req, res, next);
});

app.get("/", async (req, res) => {
  const runGroups = await getRuns();
  const origin =
    BASE_URL ??
    (USE_HTTPS
      ? `https://${req.get("host") ?? `localhost:${HTTPS_PORT}`}`
      : `${req.protocol}://${req.get("host")}`);

  const tabbar =
    runGroups.length > 0
      ? `<nav class="tabbar">${runGroups
          .map(
            (group, i) =>
              `<button type="button" class="tab${i === 0 ? " active" : ""}" data-testsoort="${escapeHtml(group.testSoort)}">${escapeHtml(group.testSoort)}</button>`
          )
          .join("")}</nav>`
      : "";

  const sections = runGroups
    .map((group, i) => {
      const runCards = group.runs
        .map((run) => {
          const allureLink = run.allureUrl
            ? `<a href="${run.allureUrl}" target="_blank" rel="noreferrer">Allure report</a>`
            : `<span class="muted">geen allure-report</span>`;

          let tracesHtml: string;
          if (run.traceFiles.length === 0) {
            tracesHtml = `<span class="muted">geen traces</span>`;
          } else if (run.traceFiles.length === 1) {
            const tf = run.traceFiles[0];
            const viewerPath = `/runs/${encodeURIComponent(run.testSoort)}/${encodeURIComponent(run.id)}/traces/view?file=${encodeURIComponent(tf)}`;
            const viewerUrl = origin + viewerPath;
            tracesHtml = `<a href="${viewerUrl}" target="_blank" rel="noreferrer">Trace: ${escapeHtml(tf)}</a>`;
          } else {
            const traceLinks = run.traceFiles
              .map((tf) => {
                const viewerPath = `/runs/${encodeURIComponent(run.testSoort)}/${encodeURIComponent(run.id)}/traces/view?file=${encodeURIComponent(tf)}`;
                const viewerUrl = origin + viewerPath;
                return `<li><a href="${viewerUrl}" target="_blank" rel="noreferrer">${escapeHtml(tf)}</a></li>`;
              })
              .join("");
            tracesHtml = `<details class="trace-details"><summary>Traces (${run.traceFiles.length})</summary><ul>${traceLinks}</ul></details>`;
          }

          return `
        <div class="run">
          <h3>${escapeHtml(run.id)}</h3>
          <div class="links">
            ${allureLink}
            <span class="sep">•</span>
            ${tracesHtml}
          </div>
        </div>
      `;
        })
        .join("");

      return `
  <section id="panel-${escapeHtml(group.testSoort)}" class="testsoort-group${i === 0 ? " active" : ""}">
    ${runCards}
  </section>
      `;
    })
    .join("");

  res.type("html").send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Test Report Server</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; }
    .tabbar { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid #ddd; }
    .tab { padding: 8px 14px; cursor: pointer; border: none; border-radius: 8px 8px 0 0; background: transparent; font-size: 14px; }
    .tab:hover { background: #f0f0f0; }
    .tab.active { background: #fff; font-weight: 600; border: 1px solid #ddd; border-bottom: 1px solid #fff; margin-bottom: -1px; }
    .testsoort-group { display: none; margin-bottom: 24px; }
    .testsoort-group.active { display: block; }
    .run { border: 1px solid #ddd; border-radius: 12px; padding: 12px 14px; margin: 10px 0; }
    h1 { margin: 0 0 10px; }
    .run h3 { margin: 0 0 6px; font-size: 16px; }
    .links a { margin-right: 10px; }
    .muted { color: #666; font-size: 13px; }
    .sep { color: #aaa; margin: 0 8px; }
    .meta { color: #666; font-size: 13px; margin-bottom: 14px; }
    code { background: #f6f6f6; padding: 2px 6px; border-radius: 6px; }
    .trace-details { display: inline-block; }
    .trace-details summary { cursor: pointer; }
    .trace-details ul { margin: 4px 0 0 16px; padding-left: 12px; }
  </style>
</head>
<body>
  <h1>Test Report Server</h1>
  <div class="meta">Root: <code>${escapeHtml(REPORTS_ROOT)}</code></div>
  ${tabbar}
  ${sections || `<div class="muted">Geen runs gevonden.</div>`}
  <script>
(function() {
  var tabs = document.querySelectorAll('.tab');
  var testsoorten = [];
  tabs.forEach(function(t) { testsoorten.push(t.getAttribute('data-testsoort')); });
  function showPanel(testsoort) {
    tabs.forEach(function(t) {
      t.classList.toggle('active', t.getAttribute('data-testsoort') === testsoort);
    });
    document.querySelectorAll('.testsoort-group').forEach(function(panel) {
      panel.classList.toggle('active', panel.id === 'panel-' + testsoort);
    });
    location.hash = testsoort;
  }
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      showPanel(tab.getAttribute('data-testsoort'));
    });
  });
  var hash = location.hash.slice(1);
  if (hash && testsoorten.indexOf(hash) !== -1) {
    showPanel(hash);
  }
})();
  <\/script>
</body>
</html>
  `);
});

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

if (USE_HTTPS) {
  const httpsOpts = parseHttpsOptions();
  if (!httpsOpts) {
    console.error("USE_HTTPS is set but could not load or generate certificates.");
    process.exit(1);
  }
  const server = https.createServer(httpsOpts, app);
  server.listen(HTTPS_PORT, () => {
    console.log(`Report server running on https://localhost:${HTTPS_PORT}`);
    console.log(`REPORTS_ROOT=${REPORTS_ROOT}`);
    console.log(
      "Chrome/Edge may show NET::ERR_CERT_AUTHORITY_INVALID for self-signed certs. " +
        "Windows: run `npm run trust-cert` once, then reload. Or use `npm run certs:mkcert` after `mkcert -install`."
    );
  });
} else {
  app.listen(PORT, () => {
    console.log(`Report server running on http://localhost:${PORT}`);
    console.log(`REPORTS_ROOT=${REPORTS_ROOT}`);
  });
}