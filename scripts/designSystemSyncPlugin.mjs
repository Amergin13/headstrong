import fs from 'node:fs';
import path from 'node:path';
import { syncDesignSystemHtml } from './syncDesignSystemHtml.mjs';

const WATCHED_PREFIXES = [
  'src/styles/',
  'src/index.css',
  'src/components/',
  'src/designSystem/',
  'src/engine/knowledgeGraph.ts',
  'src/engine/contentStrategy.ts',
  'src/utils/typography.ts',
  'tailwind.config.js',
];

function isDesignSystemSourceFile(filePath, root) {
  const rel = path.relative(root, filePath).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..') || rel === 'design-system.html') return false;
  return WATCHED_PREFIXES.some((prefix) =>
    prefix.endsWith('/') ? rel.startsWith(prefix) : rel === prefix
  );
}

/**
 * Vite dev plugin that keeps root `design-system.html` synchronized on disk whenever
 * tokens, CSS classes, Tailwind config, or design-system components are edited.
 */
export function designSystemSyncPlugin() {
  return {
    name: 'treise-design-system-sync',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root || process.cwd();
      const outputHtml = path.resolve(root, 'design-system.html');
      let timer = null;
      let running = false;
      let queued = false;

      const triggerSync = (reason) => {
        if (running) {
          queued = true;
          return;
        }
        running = true;
        Promise.resolve()
          .then(() => syncDesignSystemHtml({ viteServer: server, quiet: true }))
          .then((res) => {
            if (res?.updated) {
              server.config.logger.info(`[design-system] synced (${reason})`, { timestamp: true });
            }
          })
          .catch((err) => {
            server.config.logger.warn(`[design-system] sync failed: ${err?.message || err}`);
          })
          .finally(() => {
            running = false;
            if (queued) {
              queued = false;
              triggerSync('queued update');
            }
          });
      };

      const scheduleSync = (filePath) => {
        if (!isDesignSystemSourceFile(filePath, root)) return;
        const rel = path.relative(root, filePath).replace(/\\/g, '/');
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          triggerSync(rel);
        }, 450);
      };

      if (!fs.existsSync(outputHtml)) {
        setTimeout(() => triggerSync('initial snapshot'), 250);
      }

      server.watcher.on('change', scheduleSync);
      server.watcher.on('add', scheduleSync);
      server.watcher.on('unlink', scheduleSync);
    },
  };
}
