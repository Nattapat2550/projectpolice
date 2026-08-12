"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { LogOut, Settings, UserCog, LogIn, CircleQuestionMark, Home, ChartColumn } from 'lucide-react';
import DarkModeBtn from './DarkModeBtn';

export default function TopBar() {
    const [user, setUser] = useState<{ id: string; name: string; color?: string; role?: string } | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5003';

    // เช็คสถานะ Login
    useEffect(() => {
        const fetchUser = async () => {
            try {
                const token = document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
                if (!token) return;

                const res = await fetch(`${backendUrl}/api/v1/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success) {
                    setUser(data.data);
                }
            } catch (err) {
                console.error("Failed to fetch user", err);
            }
        };
        fetchUser();
    }, [backendUrl]);

    // ปิด dropdown เมื่อคลิกที่อื่น
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleLogout = async () => {
        try {
            const token = document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
            await fetch(`${backendUrl}/api/v1/auth/logout`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            // 🔒 ป้องกัน Insecure Cookie (CWE-614): ใส่ Secure และ SameSite ตอนล้าง
            document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; Secure; SameSite=Strict;";
            localStorage.removeItem("token");
            localStorage.removeItem("user_id");
            localStorage.removeItem("userId");

            setUser(null);
            window.location.href = '/login';
        } catch (err) {
            console.error("Logout error", err);
        }
    };

    return (
       <div 
        id="main-topbar" 
        className="flex justify-between items-center w-full px-4 sm:px-6 py-3 sm:py-4 shadow-md z-50 relative gap-2"
        style={{ backgroundColor: 'var(--header-bg)' }}
        >
            <Link href="/" aria-label="กลับหน้าหลัก ระบบติดตามงานมอบหมาย" className="shrink min-w-0 flex-1 py-2 hover:bg-white/10 rounded-lg transition-colors cursor-pointer select-none">
                <div className="flex items-center gap-2 sm:gap-4 group min-w-0">
                    <Home></Home>
                    <strong className="text-sm sm:text-lg lg:text-xl font-bold truncate text-white block">
                        ระบบติดตามงานมอบหมาย
                    </strong>
                </div>
            </Link>

            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded-lg ">
                <DarkModeBtn />
                </div>

                <Link
                    href="/dashboard"
                    aria-label="ไปหน้า Dashboard"
                    className="flex items-center gap-1 sm:gap-2 hover:bg-white/10 px-2 sm:px-4 py-2 rounded-lg transition-colors cursor-pointer select-none"
                >
                    <ChartColumn></ChartColumn>
                    <span className="font-medium hidden md:inline text-white">Dashboard</span>
                </Link>

                {user ? (
                    <div className="relative" ref={dropdownRef}>
                        <button 
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            className="flex items-center gap-2 sm:gap-3 bg-(--button) hover:opacity-80 px-2 sm:px-4 py-2 rounded-lg transition-colors border border-(--shadow) max-w-32.5 sm:max-w-50 cursor-pointer select-none"
                        >
                            <Image 
                                src="/user.png" 
                                alt="รูปโปรไฟล์ผู้ใช้งาน" 
                                width={24} 
                                height={24} 
                                className="rounded-full object-cover w-6 h-6 shrink-0"
                                unoptimized
                            />
                            <span className="font-medium text-foreground! truncate text-sm sm:text-base block">
                                {user.name}
                            </span>
                        </button>

                        {dropdownOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-(--container) border border-(--shadow) rounded-xl shadow-lg py-2 flex flex-col overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-2 border-b border-(--shadow) bg-(--button)/40">
                                    <Image 
                                        src="/user.png" 
                                        alt="รูปโปรไฟล์ย่อ" 
                                        width={20} 
                                        height={20} 
                                        className="rounded-full shrink-0"
                                        unoptimized
                                    />
                                    <span className="font-semibold text-xs text-foreground! truncate">{user.name}</span>
                                </div>
                                
                                <Link 
                                    href="/user" 
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-(--button) text-foreground transition-colors cursor-pointer select-none"
                                    onClick={() => setDropdownOpen(false)}
                                >
                                    <Settings size={18} /> จัดการโปรไฟล์
                                </Link>
                                {user.role === 'superadmin' && (
                                    <Link 
                                        href="/admin/users" 
                                        className="flex items-center gap-3 px-4 py-3 hover:bg-(--button) text-foreground transition-colors cursor-pointer select-none"
                                        onClick={() => setDropdownOpen(false)}
                                    >
                                        <UserCog size={18} /> จัดการผู้ใช้งาน
                                    </Link>
                                )}
                                <button 
                                    onClick={handleLogout}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 text-red-500 transition-colors w-full text-left cursor-pointer select-none"
                                >
                                    <LogOut size={18} /> ออกจากระบบ
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <Link href="/login">
                        <button className="flex items-center gap-1 sm:gap-2 bg-(--orangeBG) text-(--orangeText) hover:opacity-90 px-3 sm:px-5 py-2 rounded-lg transition-colors shadow-md font-medium text-sm sm:text-base whitespace-nowrap border-2 border-(--orangeBorder) cursor-pointer select-none">
                            <LogIn size={18} className="w-4 h-4 sm:w-5 sm:h-5" /> เข้าสู่ระบบ
                        </button>
                    </Link>
                )}
            </div>
        </div>
    );
}