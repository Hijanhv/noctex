/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Encrypt SDK ships raw .ts in `/grpc-web`; Next must transpile it.
  transpilePackages: ['@encrypt.xyz/pre-alpha-solana-client'],
  webpack: (config, { dev }) => {
    if (dev) {
      // Phantom's SES lockdown removes `eval` from the global scope.
      // Next.js dev mode uses eval-source-map by default, which breaks
      // after SES runs. Switch to cheap-module-source-map (no eval).
      config.devtool = 'cheap-module-source-map'
    }
    return config
  },
}
export default nextConfig
