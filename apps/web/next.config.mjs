/** @type {import('next').NextConfig} */
const isStaticExport = process.env.WEB_OUTPUT === 'export';
const basePath = process.env.WEB_BASE_PATH ?? '';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@xb/ui', '@xb/auth', '@xb/types', '@xb/config'],
  experimental: {
    typedRoutes: false,
  },
  // Shared @xb/* packages use NodeNext-style `.js` extensions in imports so
  // they compile cleanly to ESM for the api/worker (tsc-built). Webpack must
  // resolve those `.js` specifiers back to `.ts` sources when transpiling the
  // workspace packages.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
  ...(isStaticExport
    ? {
        output: 'export',
        images: { unoptimized: true },
        basePath,
        assetPrefix: basePath || undefined,
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
