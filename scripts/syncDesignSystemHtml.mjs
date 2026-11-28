import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const ROOT = process.cwd();
const INDEX_CSS_PATH = path.resolve(ROOT, 'src/index.css');
const TAILWIND_CONFIG_PATH = path.resolve(ROOT, 'tailwind.config.js');
const ICON_SVG_PATH = path.resolve(ROOT, 'public/headstrong-icon.svg');
const OUTPUT_HTML_PATH = path.resolve(ROOT, 'design-system.html');

function resolveLocalCssImports(cssText, baseDir) {
  return cssText.replace(/@import\s+['"](\.[^'"]+)['"]\s*;/g, (_match, relPath) => {
    const target = path.resolve(baseDir, relPath);
    if (!fs.existsSync(target)) return '';
    return `/* Inlined from ${relPath} */\n${fs.readFileSync(target, 'utf8')}\n`;
  });
}

async function loadTailwindConfigFresh() {
  if (!fs.existsSync(TAILWIND_CONFIG_PATH)) return undefined;
  try {
    const mod = await import(`${pathToFileURL(TAILWIND_CONFIG_PATH).href}?v=${Date.now()}`);
    return mod.default ?? mod;
  } catch {
    return TAILWIND_CONFIG_PATH;
  }
}

function getInlineIconHref() {
  if (fs.existsSync(ICON_SVG_PATH)) {
    const svg = fs.readFileSync(ICON_SVG_PATH, 'utf8');
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }
  return './public/headstrong-icon.svg';
}

async function compileProductCss() {
  const rawIndexCss = fs.readFileSync(INDEX_CSS_PATH, 'utf8');
  const inlinedCss = resolveLocalCssImports(rawIndexCss, path.dirname(INDEX_CSS_PATH));
  const twConfig = await loadTailwindConfigFresh();
  const result = await postcss([tailwindcss(twConfig), autoprefixer()]).process(inlinedCss, {
    from: INDEX_CSS_PATH,
  });
  return result.css;
}

function buildHtmlDocument({ compiledCss, renderedRootMarkup }) {
  const iconHref = getInlineIconHref();
  const standaloneFallbackScript = `
    <script id="ds-standalone-fallback">
      window.addEventListener('DOMContentLoaded', function () {
        if (document.documentElement.classList.contains('ds-live')) return;
        function rgbToHex(val) {
          var t = (val || '').trim();
          if (!t || t[0] === '#') return t.toUpperCase();
          var m = t.match(/^rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)$/i);
          if (!m) return t;
          if (m[4] !== undefined && Number(m[4]) < 1) return t;
          return '#' + [m[1], m[2], m[3]].map(function (c) {
            return Number(c).toString(16).padStart(2, '0');
          }).join('').toUpperCase();
        }
        var cs = getComputedStyle(document.documentElement);
        document.querySelectorAll('[data-token-hex]').forEach(function (el) {
          var name = el.getAttribute('data-token-hex');
          if (!name) return;
          var val = cs.getPropertyValue(name);
          if (val && val.trim()) el.textContent = rgbToHex(val);
        });
        var pill = document.getElementById('ds-sync-pill');
        if (pill) {
          pill.textContent = 'Standalone File (Live tokens.css)';
          pill.style.background = 'var(--color-bg-surface-control)';
          pill.style.color = 'var(--color-status-neutral)';
        }
        var widthButtons = Array.prototype.slice.call(document.querySelectorAll('[data-ds-width]'));
        widthButtons.forEach(function (btn) {
          btn.addEventListener('click', function () {
            var w = btn.getAttribute('data-ds-width') || '448';
            var main = document.querySelector('[data-ds-scale-root]');
            if (main) {
              main.style.setProperty('--f', 'calc(' + w + 'px / 996)');
              main.style.setProperty('--ds-phone-max', w + 'px');
            }
            document.querySelectorAll('section[style*="--f"]').forEach(function (sec) {
              sec.style.setProperty('--f', 'calc(' + w + 'px / 996)');
            });
            widthButtons.forEach(function (b) {
              var active = b.getAttribute('data-ds-width') === w;
              b.setAttribute('aria-pressed', active ? 'true' : 'false');
              b.style.background = active ? 'var(--color-action-secondary-bg)' : 'transparent';
              b.style.color = active ? 'var(--color-text-primary)' : 'var(--color-text-muted)';
            });
          });
        });

        // Standalone file:// interactivity for Design System Page Switcher & Figma End-to-End Flows Board
        var pageBtns = Array.prototype.slice.call(document.querySelectorAll('[data-ds-page]'));
        var catalogPanel = document.querySelector('[data-ds-page-panel="catalog"]');
        var flowsPanel = document.querySelector('[data-ds-page-panel="flows"]');
        var catalogControls = document.querySelector('[data-ds-catalog-controls="true"]');
        var catalogNav = document.querySelector('[data-ds-catalog-nav="true"]');
        function setStandalonePage(pageId) {
          var isFlows = pageId === 'flows';
          if (catalogPanel) catalogPanel.style.display = isFlows ? 'none' : 'block';
          if (flowsPanel) flowsPanel.style.display = isFlows ? 'block' : 'none';
          if (catalogControls) catalogControls.style.display = isFlows ? 'none' : 'flex';
          if (catalogNav) catalogNav.style.display = isFlows ? 'none' : 'flex';
          pageBtns.forEach(function (b) {
            var active = b.getAttribute('data-ds-page') === pageId;
            b.setAttribute('aria-selected', active ? 'true' : 'false');
            b.style.background = active ? 'var(--color-action-secondary-bg)' : 'transparent';
            b.style.color = active ? 'var(--color-text-primary)' : 'var(--color-text-muted)';
          });
        }
        pageBtns.forEach(function (btn) {
          btn.addEventListener('click', function () {
            var pg = btn.getAttribute('data-ds-page') || 'catalog';
            setStandalonePage(pg);
            try { history.replaceState(null, '', pg === 'flows' ? '#flows' : '#catalog'); } catch (_e) {}
          });
        });
        if (window.location.hash === '#flows') setStandalonePage('flows');

        var flowVp = document.querySelector('[data-flow-viewport="true"]');
        var flowStage = document.querySelector('[data-flow-stage="true"]');
        var zoomLabel = document.querySelector('[data-flow-zoom-label="true"]');
        if (flowVp && flowStage) {
          var fZoom = 0.52, fPanX = 32, fPanY = 24, dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
          function clampZ(z) { return Math.max(0.28, Math.min(1.6, Math.round(z * 100) / 100)); }
          function renderTransform() {
            flowStage.style.transform = 'translate3d(' + fPanX + 'px,' + fPanY + 'px,0) scale(' + fZoom + ')';
            var gs = Math.max(12, Math.round(24 * fZoom));
            flowVp.style.backgroundSize = gs + 'px ' + gs + 'px';
            flowVp.style.backgroundPosition = (fPanX % gs) + 'px ' + (fPanY % gs) + 'px';
            if (zoomLabel) zoomLabel.textContent = Math.round(fZoom * 100) + '%';
          }
          flowVp.addEventListener('wheel', function (e) {
            e.preventDefault();
            var r = flowVp.getBoundingClientRect();
            var cx = e.clientX - r.left, cy = e.clientY - r.top;
            var factor = (e.ctrlKey || e.metaKey) ? -e.deltaY * 0.008 : -e.deltaY * 0.0016;
            var nz = clampZ(fZoom * (1 + Math.max(-0.28, Math.min(0.28, factor))));
            if (nz === fZoom) return;
            var ratio = nz / fZoom;
            fPanX = Math.round(cx - (cx - fPanX) * ratio);
            fPanY = Math.round(cy - (cy - fPanY) * ratio);
            fZoom = nz;
            renderTransform();
          }, { passive: false });
          flowVp.addEventListener('pointerdown', function (e) {
            if (e.target.closest('[data-flow-ui-overlay="true"]')) return;
            dragging = true; moved = false; sx = e.clientX; sy = e.clientY; ox = fPanX; oy = fPanY;
            flowVp.style.cursor = 'grabbing';
            if (flowVp.setPointerCapture) flowVp.setPointerCapture(e.pointerId);
          });
          flowVp.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var dx = e.clientX - sx, dy = e.clientY - sy;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
            fPanX = Math.round(ox + dx); fPanY = Math.round(oy + dy);
            renderTransform();
          });
          flowVp.addEventListener('pointerup', function (e) {
            if (!dragging) return;
            dragging = false; flowVp.style.cursor = 'grab';
            if (flowVp.releasePointerCapture) flowVp.releasePointerCapture(e.pointerId);
            if (!moved) {
              var card = e.target.closest('[data-flow-node-id]');
              var insp = document.querySelector('[data-flow-inspector="true"]');
              if (card && insp) {
                insp.style.display = 'block';
                var st = insp.querySelector('[data-inspector-step]');
                var sf = insp.querySelector('[data-inspector-surface]');
                var tt = insp.querySelector('[data-inspector-title]');
                var sm = insp.querySelector('[data-inspector-summary]');
                var md = insp.querySelector('[data-inspector-module]');
                var rl = insp.querySelector('[data-inspector-rule]');
                if (st) st.textContent = 'Step ' + (card.getAttribute('data-flow-node-step') || '');
                if (sf) sf.textContent = card.getAttribute('data-flow-node-surface') || '';
                if (tt) tt.textContent = card.getAttribute('data-flow-node-title') || '';
                if (sm) sm.textContent = card.getAttribute('data-flow-node-summary') || '';
                if (md) md.textContent = card.getAttribute('data-flow-node-module') || '';
                if (rl) rl.textContent = card.getAttribute('data-flow-node-rule') || '';
              }
            }
          });
          var zIn = document.querySelector('[data-flow-zoom-in="true"]');
          var zOut = document.querySelector('[data-flow-zoom-out="true"]');
          var zReset = document.querySelector('[data-flow-zoom-reset="true"]');
          var zFit = document.querySelector('[data-flow-zoom-fit="true"]');
          if (zIn) zIn.addEventListener('click', function () { fZoom = clampZ(fZoom + 0.12); renderTransform(); });
          if (zOut) zOut.addEventListener('click', function () { fZoom = clampZ(fZoom - 0.12); renderTransform(); });
          if (zReset) zReset.addEventListener('click', function () { fZoom = 1; renderTransform(); });
          if (zFit) zFit.addEventListener('click', function () {
            var r = flowVp.getBoundingClientRect();
            fZoom = clampZ(Math.min((r.width - 64) / 2640, (r.height - 120) / 3320));
            fPanX = 32; fPanY = 56; renderTransform();
          });
          document.querySelectorAll('[data-flow-jump]').forEach(function (jb) {
            jb.addEventListener('click', function () {
              var lane = jb.getAttribute('data-flow-jump');
              var sySec = Number(jb.getAttribute('data-sec-y') || '80');
              fZoom = 0.65; fPanX = 24; fPanY = Math.round(72 - sySec * fZoom);
              renderTransform();
              document.querySelectorAll('[data-flow-section]').forEach(function (el) {
                el.style.opacity = el.getAttribute('data-flow-section') === lane ? '1' : '0.32';
              });
              document.querySelectorAll('[data-flow-node-lane]').forEach(function (el) {
                el.style.opacity = el.getAttribute('data-flow-node-lane') === lane ? '1' : '0.32';
              });
            });
          });
          var allFilter = document.querySelector('[data-flow-filter="all"]');
          if (allFilter) allFilter.addEventListener('click', function () {
            document.querySelectorAll('[data-flow-section], [data-flow-node-lane]').forEach(function (el) {
              el.style.opacity = '1';
            });
            if (zFit) zFit.click();
          });
          var inspClose = document.querySelector('[data-inspector-close="true"]');
          if (inspClose) inspClose.addEventListener('click', function () {
            var insp = document.querySelector('[data-flow-inspector="true"]');
            if (insp) insp.style.display = 'none';
          });
        }
      });
    </script>`;

  return `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="${iconHref}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#13181C" />
    <title>Treise Design System | Live Component &amp; Token Catalog</title>
    <!-- Google Fonts Inter (400, 500, 600) -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <!-- Compiled product stylesheet snapshot for offline file:// viewing (removed automatically by main.tsx under Vite HMR) -->
    <style id="design-system-snapshot-css">
${compiledCss}
    </style>
    <!-- Direct live link to tokens.css so editing CSS variables updates even when opened via file:// -->
    <link id="design-system-live-tokens-link" rel="stylesheet" href="./src/styles/tokens.css" />
    <style id="design-system-static-guards">
      html:not(.ds-live) .wk-chart-idle .wk-chart-line,
      html:not(.ds-live) .wk-chart-idle .wk-chart-fade,
      html:not(.ds-live) .wk-chart-idle .wk-chart-dot {
        visibility: visible !important;
      }
    </style>
  </head>
  <body class="bg-surface-canvas text-white min-h-screen selection:bg-brand-primary selection:text-surface-canvas overflow-x-hidden antialiased">
    <div id="root">${renderedRootMarkup}</div>
    <!-- Live Vite + React HMR entrypoint (active under http://localhost:5174/design-system.html or :5173) -->
    <script type="module" src="/src/designSystem/main.tsx"></script>${standaloneFallbackScript}
  </body>
</html>
`;
}

function normalizeForDiff(html) {
  return html.replace(/id="recharts\d+-clip"/g, 'id="recharts-clip"');
}

/**
 * Generates or refreshes `design-system.html` at the project root using the real product components,
 * `src/index.css`, `src/styles/tokens.css`, and `TREISE_DESIGN_SYSTEM`.
 */
export async function syncDesignSystemHtml({ viteServer, quiet = false } = {}) {
  let ownServer = null;
  const server =
    viteServer ??
    (ownServer = await (await import('vite')).createServer({
      root: ROOT,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
      optimizeDeps: { noDiscovery: true },
      resolve: {
        alias: {
          '@': path.resolve(ROOT, 'src'),
        },
      },
    }));

  try {
    const [compiledCss, mod] = await Promise.all([
      compileProductCss(),
      server.ssrLoadModule('/src/designSystem/ssrEntry.tsx'),
    ]);
    const renderedRootMarkup = mod.renderDesignSystemMarkup();
    const html = buildHtmlDocument({ compiledCss, renderedRootMarkup });

    const existing = fs.existsSync(OUTPUT_HTML_PATH) ? fs.readFileSync(OUTPUT_HTML_PATH, 'utf8') : null;
    const isChanged = existing === null || normalizeForDiff(existing) !== normalizeForDiff(html);
    if (isChanged) {
      fs.writeFileSync(OUTPUT_HTML_PATH, html, 'utf8');
      if (!quiet) {
        console.log(`✓ Synced ${path.relative(ROOT, OUTPUT_HTML_PATH)} (${Buffer.byteLength(html)} bytes)`);
      }
      return { updated: true, bytes: Buffer.byteLength(html) };
    }
    if (!quiet) {
      console.log(`✓ ${path.relative(ROOT, OUTPUT_HTML_PATH)} is already up to date`);
    }
    return { updated: false, bytes: Buffer.byteLength(html) };
  } finally {
    if (ownServer) {
      await ownServer.close();
    }
  }
}

const isDirectRun =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  syncDesignSystemHtml().catch((err) => {
    console.error('[syncDesignSystemHtml] Failed:', err);
    process.exitCode = 1;
  });
}
