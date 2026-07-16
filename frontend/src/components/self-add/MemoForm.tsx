"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./SelfAdd.module.css"; 
import Swal from "sweetalert2"; // 💡 นำเข้า SweetAlert2

// ฟังก์ชันหาเวลาอนาคตเพื่อตั้งเป็น default
const getFutureDateStr = (daysToAdd: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysToAdd);
  return d.toISOString().slice(0, 16); // return format "YYYY-MM-DDThh:mm"
};

export default function MemoForm() {
  const [users, setUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    title: "งานติดตามคีย์ด้วยมือ",
    memo_no: "123/2567",
    memo_date: new Date().toISOString().split('T')[0], // วันนี้
    due_date: getFutureDateStr(14), // ค่าเริ่มต้น 14 วันล่วงหน้า
    meeting_date: "",
    reply_due_date: "",
    main_text: "รายละเอียดงานที่เพิ่มเข้ามาด้วยตนเอง...",
    task_detail: "สิ่งที่ต้องดำเนินการทั้งหมด...",
    is_urgent: true,
  });

  // ใช้ Checklist แทน Dropdown
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem("token") : "";
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
        const res = await fetch(`${backendUrl}/api/v1/users`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
          }
        });
        
        if (res.ok) {
          const result = await res.json();
          setUsers(result.data || []); 
        }
      } catch (err) {
        console.error("Failed to fetch users");
      }
    };

    const fetchMe = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem("token") : "";
        if (!token) return;
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
        const res = await fetch(`${backendUrl}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.data);
        }
      } catch (err) {}
    };

    fetchUsers();
    fetchMe();

    // ตั้งค่าคน Login เป็น Default Checklist
    const loggedInUserId = typeof window !== 'undefined' ? localStorage.getItem("user_id") || localStorage.getItem("userId") || "" : "";
    if (loggedInUserId) {
        setSelectedUsers([loggedInUserId]);
    }
  }, []);

  const handleMainChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const isChecked = (e.target as HTMLInputElement).checked;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? isChecked : value,
    }));
  };

  // จัดการการเลือก Checkbox บุคคล
  const handleToggleUser = (uid: string, checked: boolean) => {
    if (uid === "all") {
        setSelectedUsers(checked ? ["all"] : []);
        return;
    }

    let newSelected = [...selectedUsers].filter(id => id !== "all");
    if (checked) {
        newSelected.push(uid);
    } else {
        newSelected = newSelected.filter(id => id !== uid);
    }
    setSelectedUsers(newSelected);
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedUsers.length === 0) {
        Swal.fire({
            icon: 'warning',
            title: 'ข้อมูลไม่ครบถ้วน',
            text: 'กรุณาเลือกผู้รับผิดชอบอย่างน้อย 1 คน',
        });
        return;
    }

    let formattedAssignments: any[] = [];
    if (selectedUsers.includes("all")) {
        formattedAssignments = users.map(u => ({
            user_id: u.id || u._id,
            role_or_name: u.name
        }));
    } else {
        formattedAssignments = selectedUsers.map(uid => {
            const u = users.find(x => String(x.id || x._id) === uid);
            return {
                user_id: Number(uid) || uid,
                role_or_name: u?.name || null
            };
        });
    }

    const validAssignments = formattedAssignments;

    // 💡 ดึง ID ของคนที่กำลังล็อกอินอยู่
    const currentUserId = typeof window !== 'undefined' ? String(localStorage.getItem("user_id") || localStorage.getItem("userId") || "") : "";

    const payload = {
      ...formData,
      document_id: null,
      due_date: formData.due_date.length === 16 ? `${formData.due_date}:00` : formData.due_date,
      assignments: validAssignments,
      created_by: currentUserId, // 💡 เพิ่มบรรทัดนี้: ส่ง ID ไปบันทึกลง Database
      createdBy: currentUserId   // 💡 เพิ่มเผื่อไว้ในกรณีที่ Backend รับเป็นชื่อนี้
    };

    try {
        const token = typeof window !== 'undefined' ? localStorage.getItem("token") : "";
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
        const response = await fetch(`${backendUrl}/api/v1/tasks`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              ...(token ? { "Authorization": `Bearer ${token}` } : {})
            },
            body: JSON.stringify(payload),
        });
        const result = await response.json();

        if (response.ok && result.success) {
            Swal.fire({
                icon: 'success',
                title: 'บันทึกข้อมูลสำเร็จ!',
                text: 'ระบบได้เพิ่มงานเข้าระบบเรียบร้อยแล้ว',
                showConfirmButton: false,
                timer: 1500
            }).then(() => {
                window.location.href = "/";
            });
        } else {
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: result.message || "Unknown error",
            });
        }
    } catch (error) {
        console.error("Error submitting form:", error);
        Swal.fire({
            icon: 'error',
            title: 'เชื่อมต่อล้มเหลว',
            text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ (Network Error)',
        });
    }
  };

  return (
    <div className="flex flex-col w-full h-full gap-6 min-h-75">
      <h1 className={styles.Header}>เพิ่มงานติดตามด้วยตนเอง</h1>
      
      <div className={styles.ContentWrapper}>
        <div className={styles.ContentContainer}>
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* ข้อมูลหลักของฟอร์ม */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>หัวข้องาน (Title)</label>
                <input type="text" name="title" value={formData.title} onChange={handleMainChange} required className="mt-1 block w-full rounded-md p-2.5 outline-none" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>เลขที่ Memo</label>
                  <input type="text" name="memo_no" value={formData.memo_no} onChange={handleMainChange} required className="mt-1 block w-full rounded-md p-2.5 outline-none" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>วันที่ Memo</label>
                  <input type="date" name="memo_date" value={formData.memo_date} onChange={handleMainChange} required className="mt-1 block w-full rounded-md p-2.5 outline-none" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>วันครบกำหนด (Due Date)</label>
                <input type="datetime-local" name="due_date" value={formData.due_date} onChange={handleMainChange} required className="mt-1 block w-full rounded-md p-2.5 outline-none" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>วันประชุม (Meeting Date)</label>
                  <input type="datetime-local" name="meeting_date" value={formData.meeting_date} onChange={handleMainChange} className="mt-1 block w-full rounded-md p-2.5 outline-none" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>วันส่งแบบตอบรับ (Reply Due Date)</label>
                  <input type="datetime-local" name="reply_due_date" value={formData.reply_due_date} onChange={handleMainChange} className="mt-1 block w-full rounded-md p-2.5 outline-none" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>รายละเอียดเอกสาร (Main Text)</label>
                <textarea name="main_text" value={formData.main_text} onChange={handleMainChange} rows={4} className="mt-1 block w-full rounded-md p-2.5 outline-none" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>สิ่งที่ต้องดำเนินการ (Task Detail)</label>
                <textarea name="task_detail" value={formData.task_detail} onChange={handleMainChange} rows={3} className="mt-1 block w-full rounded-md p-2.5 outline-none" style={{ border: "1px solid var(--yellowBorder)", backgroundColor: "var(--yellowBG)", color: "var(--foreground)" }}/>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" name="is_urgent" checked={formData.is_urgent} onChange={handleMainChange} id="is_urgent" className="w-5 h-5 cursor-pointer" style={{ accentColor: 'var(--redText)' }} />
                <label htmlFor="is_urgent" className="block text-sm font-bold cursor-pointer" style={{ color: "var(--redText)" }}>🔥 กำหนดเป็นงานเร่งด่วน (Urgent)</label>
              </div>
            </div>

            <hr className={styles.Line} style={{ borderColor: "var(--wrapper)", margin: "1.5rem 0" }} />

            {/* ส่วนจัดสรรผู้รับผิดชอบ แบบ Checklist */}
            <div>
              <h2 className="text-lg font-bold mb-4" style={{ color: "var(--header)" }}>ผู้รับผิดชอบและการมอบหมายงาน</h2>
              
              <div className="p-4 rounded-xl mb-4" style={{ border: "1px solid var(--wrapper)", backgroundColor: "rgba(0,0,0,0.02)" }}>
                 <h3 className="font-bold text-sm mb-3" style={{ color: "var(--header)" }}>เลือกผู้รับผิดชอบ (เลือกได้หลายคน)</h3>
                 
                 <div className="flex flex-col gap-2 max-h-48 overflow-y-auto border border-(--shadow) p-3 rounded bg-(--button)">
                         {(!currentUser || currentUser.role !== 'admin') && (
                         <>
                             <label className="flex items-center gap-3 cursor-pointer font-bold text-blue-600">
                                 <input type="checkbox" checked={selectedUsers.includes("all")} onChange={(e) => handleToggleUser("all", e.target.checked)} className="w-4 h-4 cursor-pointer" />
                                 ทุกหน่วยงาน (ส่วนกลาง)
                             </label>
                             <hr className="my-1 border-(--shadow)/60" />
                         </>
                         )}
                         {users
                             .filter(u => currentUser?.role !== 'admin' || (u.id || u._id) === currentUser?.id)
                             .map(u => {
                         const uid = String(u.id || u._id);
                         return (
                             <label key={uid} className="flex items-center gap-3 cursor-pointer text-foreground">
                                 <input type="checkbox" checked={selectedUsers.includes(uid)} onChange={(e) => handleToggleUser(uid, e.target.checked)} className="w-4 h-4 cursor-pointer" />
                                 {u.name} {u.role ? `(${u.role})` : ''}
                             </label>
                         );
                     })}
                 </div>
              </div>

              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full pt-4" style={{ borderTop: '1px solid var(--wrapper)' }}>
              <Link href={'/'} className="w-full sm:w-1/3">
                <button type="button" className="w-full py-2.5 px-4 rounded-xl font-bold text-center transition-colors" style={{ backgroundColor: "var(--button)", color: "var(--header)", border: "1px solid var(--wrapper)" }}>
                  กลับหน้าหลัก
                </button>
              </Link>
              <button type="submit" className="flex-1 py-2.5 px-4 rounded-xl font-bold text-lg shadow-sm transition-colors hover:opacity-90" style={{ backgroundColor: "var(--greenBG)", color: "var(--greenText)", border: "2px solid var(--greenBorder)" }}>
                บันทึกและส่งข้อมูลการติดตาม
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}