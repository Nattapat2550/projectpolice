"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

interface User {
  id: string;
  name: string;
  role: string;
  color?: string;
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";

  useEffect(() => {
    const role = typeof window !== 'undefined' ? localStorage.getItem("user_role") : null;
    if (role && role !== "superadmin") {
      Swal.fire({
        icon: "error",
        title: "ไม่มีสิทธิ์เข้าถึง",
        text: "เฉพาะ Superadmin เท่านั้นที่มีสิทธิ์จัดการ Role ได้",
      }).then(() => {
        router.replace("/");
      });
      return;
    }
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }
      const res = await fetch(`${backendUrl}/api/v1/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user_id");
        document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${backendUrl}/api/v1/users/${userId}/role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (data.success) {
        setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
        Swal.fire({
          icon: 'success',
          title: 'สำเร็จ!',
          text: 'อัปเดตสิทธิ์ผู้ใช้งานสำเร็จ',
          timer: 1500,
          showConfirmButton: false
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: data.message || 'ไม่สามารถอัปเดตสิทธิ์ได้'
        });
      }
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'เกิดข้อผิดพลาดในการอัปเดตสิทธิ์'
      });
    }
  };

  // ฟังก์ชันช่วยเลือกสีของ Badge ให้ตรงกับ globals.css
  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'superadmin':
        return 'bg-[var(--redBG)]/20 text-[var(--redText)] border border-[var(--redBorder)]/30';
      case 'admin':
        return 'bg-[var(--blueText)]/10 text-[var(--blueText)] border border-[var(--blueText)]/30';
      case 'user':
      default:
        return 'bg-[var(--wrapper)] text-[var(--foreground)]/70 border border-[var(--shadow)]/40';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
        <div className="w-8 h-8 border-4 border-[var(--blueText)] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-[var(--foreground)]/60">กำลังดึงข้อมูลผู้ใช้งาน...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">จัดการสิทธิ์ผู้ใช้งาน</h1>
          <p className="text-sm text-[var(--foreground)]/60 mt-1">ส่วนควบคุมระบบ (Superadmin Only)</p>
        </div>

        {/* Table Container (Apple Sheet Style) */}
        <div className="bg-[var(--container)] border border-[var(--shadow)]/30 rounded-2xl overflow-hidden shadow-sm transition-all duration-300">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[var(--wrapper)]/30">
                <tr>
                  <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]/70 border-b border-[var(--shadow)]/20">ผู้ใช้งาน</th>
                  <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]/70 border-b border-[var(--shadow)]/20 w-1/3 text-center">สิทธิ์การเข้าถึง (Role)</th>
                  <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]/70 border-b border-[var(--shadow)]/20 w-1/4">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--shadow)]/20 text-sm">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-[var(--wrapper)]/20 transition-colors">
                    {/* User Profile Column */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-[var(--background)]"
                          style={{ backgroundColor: u.color || 'var(--blueText)' }}
                        >
                          {u.name.substring(0, 1).toUpperCase()}
                        </div>
                        <span className="font-medium text-[var(--foreground)]">{u.name}</span>
                      </div>
                    </td>

                    {/* Role Badge Column */}
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${getRoleBadgeStyle(u.role)}`}>
                        {u.role === 'superadmin' ? 'Superadmin' : u.role === 'admin' ? 'Admin' : 'User'}
                      </span>
                    </td>

                    {/* Action Column */}
                    <td className="p-4">
                      <select
                        className="w-full px-3 py-2 rounded-xl bg-[var(--wrapper)]/40 border border-[var(--shadow)]/40 text-[var(--foreground)] text-sm focus:bg-[var(--background)] focus:ring-2 focus:ring-[var(--blueText)]/50 focus:border-transparent outline-none transition-all appearance-none cursor-pointer"
                        value={u.role || 'user'}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        // เพิ่มลูกศรลงไปใน CSS พื้นหลังเพื่อให้ดูเป็น Select หรูๆ
                        style={{
                          backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 0.75rem center',
                          backgroundSize: '1em'
                        }}
                      >
                        <option value="user" className="text-black">User (ดูได้อย่างเดียว)</option>
                        <option value="admin" className="text-black">Admin (เพิ่ม/แก้ไขงาน)</option>
                        <option value="superadmin" className="text-black">Superadmin (จัดการระบบ)</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Empty State */}
          {users.length === 0 && (
            <div className="p-12 text-center text-[var(--foreground)]/50 flex flex-col items-center">
              <span className="text-4xl mb-2 opacity-50">👥</span>
              <p className="text-sm">ไม่พบข้อมูลผู้ใช้งาน</p>
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}