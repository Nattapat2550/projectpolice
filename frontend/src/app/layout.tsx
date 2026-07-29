import type { Metadata } from "next";
import { Geist, Geist_Mono, Sarabun } from "next/font/google";
// @ts-ignore: CSS import without type declarations
import "./globals.css";
import TopBar from "@/components/TopBar";

// 💡 1. นำเข้า Component ใหม่ที่เราเพิ่งสร้าง
import BackendWakeupLoader from "@/components/BackendWakeupLoader"; 
import RoleGuard from "@/components/RoleGuard";

const sarabun = Sarabun({
  subsets: ["latin", "thai"],
  weight: ["400", "700"],
  variable: "--font-sarabun",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Project Police - ระบบจัดการและติดตามงาน",
  description: "ระบบสำหรับการจัดการ ติดตามงาน และมอบหมายงานภายในองค์กรอย่างมีประสิทธิภาพ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            const t = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', t);
          `
        }} />
      </head>

      <body className={`${sarabun.variable} font-sans antialiased`}>
        
        <div className="flex flex-col h-screen">
          <header>
            <TopBar />
          </header>

          <main role="main" className="flex-1 overflow-auto" style={{ backgroundColor: 'var(--background)' }}>
            
            {/* 💡 2. นำมาครอบเนื้อหาของหน้าเว็บ (children) ไว้ */}
            <BackendWakeupLoader>
              <RoleGuard>
                {children}
              </RoleGuard>
            </BackendWakeupLoader>

          </main>
        </div>

      </body>
    </html>
  );
}