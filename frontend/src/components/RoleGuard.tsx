"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Swal from "sweetalert2";

interface RoleGuardProps {
  children: React.ReactNode;
}

export default function RoleGuard({ children }: RoleGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [isBlockedUser, setIsBlockedUser] = useState(false);

  useEffect(() => {
    // Skip auth guard for public login route
    if (pathname.startsWith("/login")) {
      setLoading(false);
      return;
    }

    const checkRolePermission = async () => {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("token") ||
            document.cookie.split("; ").find((row) => row.startsWith("token="))?.split("=")[1]
          : null;

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
        const res = await fetch(`${backendUrl}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem("token");
          localStorage.removeItem("user_id");
          localStorage.removeItem("user_role");
          document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
          router.replace("/login");
          return;
        }

        const data = await res.json();
        if (data.success && data.data) {
          const userRole = data.data.role || "user";
          localStorage.setItem("user_role", userRole);

          // 🔒 Requirement 1: 'user' role is blocked from ALL system pages
          if (userRole === "user") {
            setIsBlockedUser(true);
            setLoading(false);
            return;
          }

          // 🔒 Requirement 2: 'admin' role cannot access role management page (/admin/users)
          if (pathname.startsWith("/admin/users") && userRole !== "superadmin") {
            Swal.fire({
              icon: "error",
              title: "ไม่มีสิทธิ์เข้าถึง",
              text: "เฉพาะ Superadmin เท่านั้นที่มีสิทธิ์เข้าใช้งานหน้าจัดการ Role",
              confirmButtonText: "ตกลง",
            }).then(() => {
              router.replace("/");
            });
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error("Role check error:", err);
      } finally {
        setLoading(false);
      }
    };

    checkRolePermission();
  }, [pathname, router]);

  useEffect(() => {
    if (isBlockedUser) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [isBlockedUser]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_role");
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = "/login";
  };

  // If role is 'user', render a blank access-denied screen (fullscreen fixed overlay, no scroll, no topbar)
  if (isBlockedUser) {
    return (
      <div className="fixed inset-0 z-[99999] flex h-screen w-screen flex-col items-center justify-center bg-zinc-950 text-white p-6 overflow-hidden select-none">
        <div className="max-w-md w-full rounded-2xl bg-zinc-900 p-8 border border-zinc-800 shadow-2xl text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-red-400 mb-2">เข้าถึงถูกระงับ</h2>
          <p className="text-zinc-400 mb-6 text-sm leading-relaxed">
            บัญชีของคุณอยู่ในสิทธิ์ระดับผู้เยี่ยมชม (Guest / User) ซึ่งถูกระงับการใช้งานในระบบเพื่อความปลอดภัย กรุณาติดต่อผู้ดูแลระบบ (Superadmin) เพื่อปรับเปลี่ยนสิทธิ์
          </p>
          <button
            onClick={handleLogout}
            className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition duration-200 shadow-lg cursor-pointer"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return null;
  }

  return <>{children}</>;
}
