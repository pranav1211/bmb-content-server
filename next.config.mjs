/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'content.beyondmebtw.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
