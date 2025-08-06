/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'content.beyondmebtw.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'bmb-content-server.vercel.app',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
