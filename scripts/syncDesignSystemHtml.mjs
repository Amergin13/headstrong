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
