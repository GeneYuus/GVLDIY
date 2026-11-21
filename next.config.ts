import type {NextConfig} from 'next';
import {PHASE_DEVELOPMENT_SERVER} from 'next/constants';

export default function createNextConfig(phase: string): NextConfig {
  const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;

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
          hostname: 'picsum.photos',
          port: '',
          pathname: '/**',
        },
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
    output: isDevServer ? undefined : 'standalone',
    transpilePackages: ['motion'],
    webpack: (config, {dev}) => {
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
