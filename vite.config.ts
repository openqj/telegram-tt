import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import type { NormalizedOutputOptions, OutputBundle, PluginContext } from 'rolldown';
import { bundleStats } from 'rollup-plugin-bundle-stats';
import { visualizer } from 'rollup-plugin-visualizer';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv, normalizePath, type Plugin, type PluginOption, type UserConfig } from 'vite';
import { type Target, viteStaticCopy } from 'vite-plugin-static-copy';
import { watchAndRun } from 'vite-plugin-watch-and-run';

import buildGitInfoPlugin from './plugins/gitInfo.ts';
import packageJson from './package.json' with { type: 'json' };

const DIR_NAME = dirname(fileURLToPath(import.meta.url));
const PRODUCTION_URL = 'https://web.telegram.org/a';

const { version: APP_VERSION } = packageJson;
const BUNDLE_STATS_OUT_DIR = 'bundle-stats';
const DEFAULT_BUNDLE_STATS_BASELINE_FILE = 'baseline.json';
const BUNDLE_STATS_VISUALIZER_FILE = 'visualizer.html';
const WORKER_BUNDLE_COLLECTOR_PLUGIN_NAME = 'telegram:collect-worker-report-bundle';
const BUNDLE_REPORT_PLUGIN_SUFFIX = ':with-workers';
const DEV_SERVER_WATCH_IGNORES = [
  '**/.cache/**',
  '**/dist/**',
  '**/tauri/target/**',
];
const DEV_BUNDLE_WARMUP_CLIENT_FILES = [
  'src/bundles/auth.ts',
  'src/bundles/main.ts',
  'src/bundles/extra.ts',
  'src/bundles/calls.ts',
  'src/bundles/stars.ts',
];
const IMAGE_ASSET_RE = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const WATCHED_STATIC_COPY_TARGETS: Target[] = [
  {
    src: normalizePath(resolve(DIR_NAME, 'node_modules/opus-recorder/dist/decoderWorker.min.wasm')),
    dest: 'assets',
    rename: { stripBase: true },
  },
];
const UNWATCHED_STATIC_COPY_TARGETS: Target[] = [
  {
    src: normalizePath(resolve(DIR_NAME, 'node_modules/emoji-data-ios/img-apple-64/**/*')),
    dest: '.',
    rename: { stripBase: 2 },
  },
  {
    src: normalizePath(resolve(DIR_NAME, 'node_modules/emoji-data-ios/img-apple-160/**/*')),
    dest: '.',
    rename: { stripBase: 2 },
  },
];

type BundleReportPlugin = {
  name: string;
  generateBundle?: unknown;
};

type BundleReportHook = (
  this: PluginContext,
  outputOptions: NormalizedOutputOptions,
  bundle: OutputBundle,
  isWrite: boolean,
) => void | Promise<void>;

export default defineConfig(({ mode }): UserConfig => {
  const env = loadEnv(mode, process.cwd(), '');
  setViteEnv(env);
  const {
    HEAD = '',
    BUNDLE_STATS: bundleStatsValue = '',
    BUNDLE_STATS_BASELINE_PATH: bundleStatsBaselinePath = '',
    BUNDLE_STATS_VISUALIZER: bundleStatsVisualizerValue = '',
    HTTPS_CERT_PATH: httpsCertPath = '',
    HTTPS_KEY_PATH: httpsKeyPath = '',
  } = env;
  const appEnv = env.APP_ENV || (mode === 'development' ? 'development' : 'production');
  const defaultAppTitle = `Telegram${appEnv !== 'production' ? ' Beta' : ''}`;
  const isDevelopmentMode = mode === 'development';
  const isGramsrvMode = mode === 'gramsrv';
  const isProductionApp = appEnv === 'production';
  const appleIcon = isProductionApp ? 'apple-touch-icon' : 'apple-touch-icon-dev';
  const mainIcon = isProductionApp ? 'icon-192x192' : 'icon-dev-192x192';
  const manifest = isProductionApp ? 'site.webmanifest' : 'site_dev.webmanifest';
  const hasLocalGramsrvEndpoint = (isDevelopmentMode || isGramsrvMode)
    && Boolean(env.TG_LOCAL_MTPROTO_WS_URL);
  const hasPaseoRelayEndpoint = Boolean(env.TG_PASEO_RELAY_WS_URL);
  const baseUrl = env.BASE_URL || (hasLocalGramsrvEndpoint ? 'http://localhost:1234/a' : PRODUCTION_URL);
  const appTitle = env.APP_TITLE || defaultAppTitle;
  if (isGramsrvMode && !hasLocalGramsrvEndpoint) {
    throw new Error('TG_LOCAL_MTPROTO_WS_URL is required for the Gramsrv build');
  }
  if (isGramsrvMode && !env.TG_LOCAL_MTPROTO_WS_URL.startsWith('wss://')) {
    throw new Error('TG_LOCAL_MTPROTO_WS_URL must use wss:// for the Gramsrv build');
  }
  if (isGramsrvMode && !hasPaseoRelayEndpoint) {
    throw new Error('TG_PASEO_RELAY_WS_URL is required for the Gramsrv build');
  }
  if (isGramsrvMode && !env.TG_PASEO_RELAY_WS_URL.startsWith('wss://')) {
    throw new Error('TG_PASEO_RELAY_WS_URL must use wss:// for the Gramsrv build');
  }
  if (isGramsrvMode && !env.BASE_URL) {
    throw new Error('BASE_URL must be set to the self-hosted Web A URL for the Gramsrv build');
  }
  if (hasLocalGramsrvEndpoint) {
    const gramsrvUrl = new URL(env.TG_LOCAL_MTPROTO_WS_URL);
    if (isTelegramDomain(gramsrvUrl.hostname)) {
      throw new Error('Local Gramsrv endpoints must not use a Telegram-owned host');
    }
  }
  if (isGramsrvMode) {
    const publicUrl = new URL(baseUrl);
    if (isTelegramDomain(publicUrl.hostname)) {
      throw new Error('Gramsrv builds must not use a Telegram-owned host for Web A or MTProto');
    }
    if (publicUrl.protocol !== 'https:') {
      throw new Error('BASE_URL must use https:// for the Gramsrv build');
    }
  }
  const paseoIdentityOrigin = env.TG_PASEO_IDENTITY_URL
    ? getHttpOrigin(env.TG_PASEO_IDENTITY_URL, 'TG_PASEO_IDENTITY_URL')
    : undefined;
  const csp = buildCsp(
    appEnv,
    hasLocalGramsrvEndpoint && env.TG_LOCAL_MTPROTO_WS_URL
      ? getWebSocketOrigin(env.TG_LOCAL_MTPROTO_WS_URL)
      : undefined,
    isDevelopmentMode,
    isGramsrvMode,
    hasPaseoRelayEndpoint
      ? getWebSocketOrigin(env.TG_PASEO_RELAY_WS_URL, 'TG_PASEO_RELAY_WS_URL')
      : undefined,
    paseoIdentityOrigin,
  );
  const telegramApiId = env.TELEGRAM_API_ID || '';
  const telegramApiHash = env.TELEGRAM_API_HASH || '';
  const workerReportBundles: OutputBundle[] = [];
  const plugins: PluginOption[] = [
    buildGitInfoPlugin({
      appEnv,
      head: HEAD,
      isDevelopmentMode,
      rootDir: DIR_NAME,
    }),
    viteStaticCopy({ targets: WATCHED_STATIC_COPY_TARGETS }),
    viteStaticCopy({
      targets: UNWATCHED_STATIC_COPY_TARGETS,
      watch: {
        options: {
          ignored: '**/*',
        },
      },
    }),
    isDevelopmentMode && watchAndRun([
      {
        name: 'lang',
        watch: buildProjectPath('src/assets/localization/fallback.strings'),
        watchFile: (filePath) => Promise.resolve(isProjectFile(filePath, 'src/assets/localization/fallback.strings')),
        run: 'npm run lang:ts',
      },
      {
        name: 'gramjs',
        watch: buildProjectPath('src/lib/gramjs/tl/static'),
        watchFile: (filePath) => Promise.resolve(isPathInsideProjectDirectory(filePath, 'src/lib/gramjs/tl/static')),
        run: 'npm run gramjs:tl',
      },
      {
        name: 'icons',
        watch: buildProjectPath('src/assets/font-icons'),
        watchFile: (filePath) => Promise.resolve(isPathInsideProjectDirectory(filePath, 'src/assets/font-icons')),
        run: 'npm run icons:build',
      },
    ]),
  ];

  if (bundleStatsVisualizerValue === '1') {
    plugins.push(createBundleReportPlugin(visualizer((outputOptions) => ({
      filename: resolve(
        DIR_NAME,
        outputOptions.dir,
        BUNDLE_STATS_OUT_DIR,
        BUNDLE_STATS_VISUALIZER_FILE,
      ),
      open: true,
      template: 'treemap',
    })), workerReportBundles));
  }

  if (bundleStatsValue === '1') {
    plugins.push(createBundleReportPlugin(bundleStats({
      html: true,
      json: true,
      compare: Boolean(bundleStatsBaselinePath),
      baseline: !bundleStatsBaselinePath, // For master branch upload
      baselineFilepath: bundleStatsBaselinePath || DEFAULT_BUNDLE_STATS_BASELINE_FILE,
      outDir: BUNDLE_STATS_OUT_DIR,
    }), workerReportBundles));

    if (bundleStatsBaselinePath) {
      // Write current PR stats for the compact GitHub comment
      plugins.push(createBundleReportPlugin(bundleStats({
        html: false,
        json: false,
        compare: false,
        baseline: true,
        baselineFilepath: DEFAULT_BUNDLE_STATS_BASELINE_FILE,
        outDir: BUNDLE_STATS_OUT_DIR,
        silent: true,
      }), workerReportBundles));
    }
  }

  const shouldCollectWorkerReportBundles = bundleStatsVisualizerValue === '1' || bundleStatsValue === '1';

  if (appEnv !== 'test' && !hasLocalGramsrvEndpoint && (!telegramApiId || !telegramApiHash)) {
    throw new Error('Missing required Telegram API credentials');
  }

  setViteEnv({
    TG_APP_ENV: appEnv,
    TG_APP_NAME: env.APP_NAME || '',
    TG_APP_TITLE: appTitle,
    TG_PUBLIC_URL: baseUrl,
    TG_CSP: csp,
    TG_APPLE_ICON: appleIcon,
    TG_MAIN_ICON: mainIcon,
    TG_MANIFEST: manifest,
    TG_TELEGRAM_API_ID: telegramApiId,
    TG_TELEGRAM_API_HASH: telegramApiHash,
    TG_LOCAL_MTPROTO_WS_URL: hasLocalGramsrvEndpoint ? env.TG_LOCAL_MTPROTO_WS_URL : '',
    TG_MTPROTO_USE_GRAMSRV: hasLocalGramsrvEndpoint ? '1' : '0',
    TG_TEST_SESSION: env.TEST_SESSION || '',
  });

  return {
    base: './',
    envPrefix: ['VITE_', 'TG_'],
    assetsInclude: ['**/*.tgs'],
    optimizeDeps: {
      exclude: ['temml'],
    },
    define: {
      APP_VERSION: JSON.stringify(APP_VERSION),
    },
    resolve: {
      tsconfigPaths: true,
    },
    css: {
      modules: {
        localsConvention: 'camelCase',
        generateScopedName: isProductionApp ? '[hash:base64:8]' : '[name]__[local]',
      },
    },
    server: {
      host: '0.0.0.0',
      port: 1234,
      strictPort: true,
      headers: {
        'Content-Security-Policy': csp,
        'Service-Worker-Allowed': '/',
      },
      https: getHttpsConfig(httpsCertPath, httpsKeyPath),
      proxy: {
        ...(env.LOCAL_GRAMSRV_HTTP_TARGET ? {
          '/owpengram/server-info': {
            target: env.LOCAL_GRAMSRV_HTTP_TARGET,
            changeOrigin: true,
          },
          '/owpengram/agent': {
            target: env.LOCAL_GRAMSRV_HTTP_TARGET,
            changeOrigin: true,
          },
        } : {}),
      },
      warmup: {
        clientFiles: DEV_BUNDLE_WARMUP_CLIENT_FILES,
      },
      watch: {
        ignored: DEV_SERVER_WATCH_IGNORES,
      },
    },
    build: {
      sourcemap: true,
      assetsInlineLimit: (filePath) => (IMAGE_ASSET_RE.test(filePath) ? false : undefined),
    },
    worker: {
      plugins: shouldCollectWorkerReportBundles ? () => [
        createWorkerBundleCollectorPlugin(workerReportBundles),
      ] : undefined,
      rolldownOptions: {
        output: {
          entryFileNames: '[name]-[hash].js',
        },
      },
    },
    plugins,
  };
});

function createBundleReportPlugin(plugin: BundleReportPlugin, workerReportBundles: OutputBundle[]): Plugin {
  return {
    name: `${plugin.name}${BUNDLE_REPORT_PLUGIN_SUFFIX}`,
    async generateBundle(outputOptions, bundle, isWrite) {
      const generateBundle = parseBundleReportHook(plugin.generateBundle);

      await generateBundle?.call(
        this,
        outputOptions,
        mergeOutputBundles(bundle, workerReportBundles),
        isWrite,
      );
    },
  };
}

function createWorkerBundleCollectorPlugin(workerReportBundles: OutputBundle[]): Plugin {
  return {
    name: WORKER_BUNDLE_COLLECTOR_PLUGIN_NAME,
    generateBundle(_outputOptions, bundle) {
      workerReportBundles.push({ ...bundle });
    },
  };
}

function mergeOutputBundles(bundle: OutputBundle, workerReportBundles: OutputBundle[]): OutputBundle {
  const result: OutputBundle = {};

  Object.assign(result, bundle, ...workerReportBundles);

  return result;
}

function parseBundleReportHook(hook: unknown): BundleReportHook | undefined {
  if (typeof hook === 'function') {
    return hook as BundleReportHook;
  }

  if (!hook || typeof hook !== 'object' || !('handler' in hook) || typeof hook.handler !== 'function') {
    return undefined;
  }

  return hook.handler as BundleReportHook;
}

function setViteEnv(env: Record<string, string>) {
  Object.entries(env).forEach(([key, value]) => {
    process.env[key] = value;
  });
}

function buildCsp(
  appEnv: string,
  localWebSocketOrigin?: string,
  isDevelopmentMode = false,
  isGramsrvMode = false,
  paseoRelayWebSocketOrigin?: string,
  paseoIdentityOrigin?: string,
) {
  const connectionOrigins = [localWebSocketOrigin, paseoRelayWebSocketOrigin, paseoIdentityOrigin]
    .filter(Boolean)
    .join(' ');
  const connectSrc = isGramsrvMode || Boolean(localWebSocketOrigin)
    ? `'self' blob: ${connectionOrigins}`
    : `'self' wss://*.web.telegram.org blob: http: https: wss: ${localWebSocketOrigin || ''}`;

  return `
  default-src 'self';
  connect-src ${connectSrc} ${appEnv === 'development' ? 'ipc:' : ''};
  script-src 'self' 'wasm-unsafe-eval'
    https://t.me/_websync_ https://telegram.me/_websync_ https://telegram.dog/_websync_;
  worker-src 'self'${isDevelopmentMode ? ' blob:' : ''};
  style-src 'self' 'unsafe-inline';
  font-src 'self' data:;
  img-src 'self' data: blob: https://ss3.4sqi.net/img/categories_v2/;
  media-src 'self' blob: data:;
  object-src 'none';
  frame-src http: https:
    bitkeep: bnc: bybitapp: echooo: imtokenv2: mytonwallet-tc:
    nicegram-tc: safepal-tc: tonkeeper-pro-tc: tonkeeper-tc:;
  base-uri 'none';
  form-action 'none';`
    .replace(/\s+/g, ' ').trim();
}

function getWebSocketOrigin(url: string, envName = 'TG_LOCAL_MTPROTO_WS_URL') {
  const { protocol, host } = new URL(url);
  if (protocol !== 'ws:' && protocol !== 'wss:') {
    throw new Error(`${envName} must use ws:// or wss://`);
  }

  return `${protocol}//${host}`;
}

function getHttpOrigin(url: string, envName: string) {
  const parsed = new URL(url);
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${envName} must be an HTTP or HTTPS URL without credentials or query parameters`);
  }
  if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
    throw new Error(`${envName} must use HTTPS outside localhost`);
  }

  return `${parsed.protocol}//${parsed.host}`;
}

function isTelegramDomain(hostname: string) {
  const host = hostname.replace(/\.$/, '').toLowerCase();
  return host === 'telegram.org' || host.endsWith('.telegram.org')
    || host === 'telegram.me' || host.endsWith('.telegram.me')
    || host === 't.me' || host.endsWith('.t.me');
}

function buildProjectPath(projectPath: string) {
  return normalizePath(resolve(DIR_NAME, projectPath));
}

function isProjectFile(filePath: string, projectPath: string) {
  return normalizePath(filePath) === buildProjectPath(projectPath);
}

function isPathInsideProjectDirectory(filePath: string, projectPath: string) {
  return normalizePath(filePath).startsWith(`${buildProjectPath(projectPath)}/`);
}

function getHttpsConfig(httpsCertPath: string, httpsKeyPath: string) {
  if (!httpsCertPath || !httpsKeyPath) return undefined;

  return {
    cert: readFileSync(httpsCertPath),
    key: readFileSync(httpsKeyPath),
  };
}
