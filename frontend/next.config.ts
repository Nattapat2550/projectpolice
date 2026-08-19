import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 💡 เปิดระบบบีบอัด Gzip/Brotli อัตโนมัติ (ช่วยลดเวลาตอบสนองเครือข่าย)
  compress: true, 



  // 💡 ปรับแต่งการโหลด Image ให้รองรับการทำงานบน Render
  images: {
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60, 
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY", 
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; connect-src 'self' https://*.vercel.app https://*.onrender.com https://*.supabase.co http://localhost:* http://127.0.0.1:* https://backend-pi-gilt-27.vercel.app https://projectpolice-1.onrender.com https://projectpolice.onrender.com http://localhost:5003 https://projectpolice-iota.vercel.app https://projectpolice-um54.vercel.app ;"
          },
        ],
      },
    ];
  },
};

export default nextConfig;