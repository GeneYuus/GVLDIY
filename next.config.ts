import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

export default function createNextConfig(phase: string): NextConfig {
  const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;

  const baseCspDirectives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDevServer ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.r2.dev https://*.greenvillediyarchive.org https://www.googleapis.com https://i.ytimg.com",
    "media-src 'self' data: blob: https://*.r2.dev https://*.greenvillediyarchive.org https://www.googleapis.com https://samply.app",
    "font-src 'self' data:",
    "connect-src 'self' blob: https://*.r2.dev https://*.greenvillediyarchive.org https://samply.app",
    "frame-src 'self' https://www.youtube-nocookie.com https://samply.app",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  const publicCsp = baseCspDirectives.join('; ');
  const prodAdminCsp = [...baseCspDirectives, "frame-ancestors 'none'"].join('; ');

  return {
    distDir: isDevServer ? '.next-dev' : '.next',
    reactStrictMode: true,
    productionBrowserSourceMaps: false,
    eslint: {
      ignoreDuringBuilds: true,
    },
    // Type-checking runs sequentially via `tsc --noEmit` in `npm run build` before `next build`
    // to avoid spawning a concurrent 550MB TypeScript worker during Webpack bundling.
    typescript: {
      ignoreBuildErrors: true,
    },
    experimental: {
      webpackMemoryOptimizations: true,
      cpus: 1,
      workerThreads: false,
      optimizePackageImports: ['lucide-react', '@puckeditor/core'],
    },
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: '**.r2.dev',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: '**.greenvillediyarchive.org',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: 'www.googleapis.com',
          port: '',
          pathname: '/**',
        },
      ],
    },
    async headers() {
      const rules = [
        {
          source: '/:path*',
          headers: [
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            {
              key: 'Referrer-Policy',
              value: 'strict-origin-when-cross-origin',
            },
            {
              key: 'Permissions-Policy',
              value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
            },
            {
              key: 'Content-Security-Policy',
              value: publicCsp,
            },
          ],
        },
      ];

      // Confirmed Phase 1 Choice: Apply X-Frame-Options: DENY on /admin in production only
      // so testing inside the AI Studio preview iframe works seamlessly during development.
      if (!isDevServer) {
        rules.push(
          {
            source: '/admin',
            headers: [
              { key: 'X-Frame-Options', value: 'DENY' },
              { key: 'Content-Security-Policy', value: prodAdminCsp },
            ],
          },
          {
            source: '/admin/:path*',
            headers: [
              { key: 'X-Frame-Options', value: 'DENY' },
              { key: 'Content-Security-Policy', value: prodAdminCsp },
            ],
          }
        );
      }

      return rules;
    },
    output: isDevServer ? undefined : 'standalone',
    transpilePackages: ['motion'],
    webpack: (config, { dev }) => {
      // Disable multi-hundred-MB persistent webpack packfiles on tmpfs RAM disk
      config.cache = false;
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      if (dev && process.env.DISABLE_HMR === 'true') {
        config.watchOptions = {
          ignored: /.*/,
        };
      }
      return config;
    },
  };
}
