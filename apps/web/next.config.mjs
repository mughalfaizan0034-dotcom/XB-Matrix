/** @type {import('next').NextConfig} */
const isStaticExport = process.env.WEB_OUTPUT === 'export';
const basePath = process.env.WEB_BASE_PATH ?? '';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@xb/ui', '@xb/auth', '@xb/types', '@xb/config'],
  experimental: {
    typedRoutes: false,
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
