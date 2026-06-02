"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { LogOut, Settings, LogIn } from 'lucide-react';
import DarkModeBtn from './DarkModeBtn';

export default function TopBar() {
    const [user, setUser] = useState<{ id: string; name: string; color?: string } | null>(null);
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
            
            // 💡 ล้างข้อมูลออกจากทั้ง Cookie และ LocalStorage ให้เกลี้ยง
            document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
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
            <Link href="/" aria-label="กลับหน้าหลัก ระบบติดตามงานมอบหมาย" className="shrink min-w-0 flex-1">
                <div className="flex items-center gap-2 sm:gap-4 group min-w-0">
                    <Image 
                        src="/police.png" 
                        alt="โลโก้ระบบติดตามงานมอบหมาย" 
                        width={40} 
                        height={40} 
                        className="transition-transform group-hover:scale-110 w-8 h-8 sm:w-10 sm:h-10 shrink-0" 
                        priority
                    />
                    <strong className="text-sm sm:text-lg lg:text-xl font-bold truncate text-white block">
                        ระบบติดตามงานมอบหมาย
                    </strong>
                </div>
            </Link>

            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                <DarkModeBtn />

                <Link href="/help" aria-label="ไปหน้าช่วยเหลือการใช้งาน">
                    <button className="flex items-center gap-1 sm:gap-2 hover:bg-white/10 px-2 sm:px-4 py-2 rounded-lg transition-colors">
                        <Image src="/window.svg" alt="ไอคอนช่วยเหลือ" width={24} height={24} className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
                        <span className="font-medium hidden md:inline text-white">ช่วยเหลือ</span>
                    </button>
                </Link>

                {user ? (
                    <div className="relative" ref={dropdownRef}>
                        <button 
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            className="flex items-center gap-2 sm:gap-3 bg-(--button) hover:opacity-80 px-2 sm:px-4 py-2 rounded-full transition-all border border-(--shadow) max-w-32.5 sm:max-w-50"
                            style={{
                                boxShadow: "0 1px 3px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.08)"
                            }}
                        >
                            <Image 
                                src="/user.png" 
                                alt="รูปโปรไฟล์ผู้ใช้งาน" 
                                width={24} 
                                height={24} 
                                className="rounded-full object-cover w-6 h-6 shrink-0"
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
                                    />
                                    <span className="font-semibold text-xs text-foreground! truncate">{user.name}</span>
                                </div>
                                
                                <Link 
                                    href="/user" 
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-(--button) text-foreground transition-colors"
                                    onClick={() => setDropdownOpen(false)}
                                >
                                    <Settings size={18} /> จัดการโปรไฟล์
                                </Link>
                                <button 
                                    onClick={handleLogout}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 text-red-500 transition-colors w-full text-left"
                                >
                                    <LogOut size={18} /> ออกจากระบบ
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <Link href="/login">
                       <button className="flex items-center gap-1 sm:gap-2 bg-(--orangeBG) text-(--orangeText) hover:opacity-90 px-3 sm:px-5 py-2 rounded-full transition-all font-medium text-sm sm:text-base whitespace-nowrap"
                        style={{
                            border: "0.5px solid var(--orangeBorder)",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.08)"
                        }}
                    >
                        <LogIn size={18} className="w-4 h-4 sm:w-5 sm:h-5" /> เข้าสู่ระบบ
                        </button>
                    </Link>
                )}
            </div>
        </div>
    );
}