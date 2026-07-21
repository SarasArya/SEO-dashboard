/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-libsql",
    "@libsql/client",
    "libsql",
    "playwright",
    "lighthouse",
    "chrome-launcher",
  ],
};
module.exports = nextConfig;
