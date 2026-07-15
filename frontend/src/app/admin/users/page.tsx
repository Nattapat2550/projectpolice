"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
        alert("อัปเดตสิทธิ์ผู้ใช้งานสำเร็จ");
      } else {
        alert("เกิดข้อผิดพลาด: " + data.message);
      }
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการอัปเดตสิทธิ์");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-zinc-500">กำลังโหลด...</div>;
  }

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-foreground">จัดการสิทธิ์ผู้ใช้งาน (Superadmin)</h1>
      <div className="bg-(--container) rounded-xl border border-(--shadow) overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-zinc-100 dark:bg-zinc-800/50">
            <tr>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800">ชื่อผู้ใช้งาน</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800 w-1/3">สิทธิ์ (Role)</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800 w-1/4">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                      style={{ backgroundColor: u.color || '#3B82F6' }}
                    >
                      {u.name.substring(0, 1).toUpperCase()}
                    </div>
                    <span className="font-medium text-foreground">{u.name}</span>
                  </div>
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    u.role === 'superadmin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
                    u.role === 'admin' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                    'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}>
                    {u.role || 'user'}
                  </span>
                </td>
                <td className="p-4">
                  <select
                    className="w-full p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={u.role || 'user'}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  >
                    <option value="user">User (ดูได้อย่างเดียว)</option>
                    <option value="admin">Admin (เพิ่ม/แก้ไขงานตัวเอง)</option>
                    <option value="superadmin">Superadmin (จัดการระบบ)</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="p-8 text-center text-zinc-500">ไม่พบข้อมูลผู้ใช้งาน</div>
        )}
      </div>
    </div>
  );
}
