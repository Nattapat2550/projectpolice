"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

export default function AddFileLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            const token = typeof window !== 'undefined' ? localStorage.getItem("token") || document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] : null;

            if (!token) {
                Swal.fire({
                    icon: 'warning',
                    title: 'ต้องเข้าสู่ระบบ',
                    text: 'คุณต้องเข้าสู่ระบบเพื่อเข้าใช้งานหน้านี้',
                    confirmButtonText: 'ตกลง'
                }).then(() => {
                    router.push('/login');
                });
                return;
            }

            try {
                const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
                const res = await fetch(`${backendUrl}/api/v1/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                
                const data = await res.json();
                if (data.success) {
                    if (data.data.role === 'user') {
                        Swal.fire({
                            icon: 'error',
                            title: 'ไม่มีสิทธิ์เข้าถึง',
                            text: 'บัญชีระดับผู้เยี่ยมชมไม่สามารถเพิ่มงานได้',
                            confirmButtonText: 'ตกลง'
                        }).then(() => {
                            router.push('/');
                        });
                    } else {
                        setIsAuthorized(true);
                    }
                } else {
                    router.push('/login');
                }
            } catch (err) {
                router.push('/login');
            }
        };

        checkAuth();
    }, [router]);

    if (!isAuthorized) {
        return <div className="flex h-screen items-center justify-center text-zinc-500 font-bold">กำลังตรวจสอบสิทธิ์...</div>;
    }

    return <>{children}</>;
}
