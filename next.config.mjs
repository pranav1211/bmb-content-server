/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'bmb-content-server.vercel.app',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
