"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./SelfAdd.module.css"; 
import Swal from "sweetalert2";
import Select from "react-select";

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
    memo_no: "",
    memo_date: new Date().toISOString().split('T')[0], // วันนี้
    sender: "",
    recipient_to: "",
    title: "",
    due_date: getFutureDateStr(14), // ค่าเริ่มต้น 14 วันล่วงหน้า
    meeting_date: "",
    reply_due_date: "",
    main_text: "",
    task_detail: "",
    is_urgent: true,
    receive_no: "",
    receive_date: "",
    sign_date: "",
    urgency_level: "ปกติ",
    secret_level: "ปกติ"
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

  const handleMainChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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

    const validAssignments: any[] = [];
    if (selectedUsers.includes("all")) {
        validAssignments.push({ user_id: null, role_or_name: "all" });
    } else {
        selectedUsers.forEach(uid => {
            const matchedUser = users.find(u => String(u.id || u._id) === uid);
            if (matchedUser) {
                validAssignments.push({ user_id: matchedUser.id || matchedUser._id, role_or_name: matchedUser.name });
            }
        });
    }

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
    <form onSubmit={handleSubmit} className="w-full space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ===== กล่องซ้าย (สไตล์ Container เดิม) ===== */}
        <div className="lg:col-span-7 flex flex-col gap-5 p-5 sm:p-6 rounded-lg border border-(--wrapper) shadow-[4px_4px_0px_rgba(0,0,0,0.1)] bg-(--container)">
          <h2 className="text-lg font-bold border-b pb-3 border-(--wrapper)" style={{ color: "var(--header)" }}>
            ข้อมูลบันทึก / หนังสือ
          </h2>
          
          {/* 1. เลขที่ Memo & 2. วันที่ Memo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>เลขที่ Memo</label>
              <input type="text" name="memo_no" value={formData.memo_no} onChange={handleMainChange} placeholder="เช่น 123/2567" required className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>วันที่ Memo</label>
              <input type="date" name="memo_date" value={formData.memo_date} onChange={handleMainChange} required className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
            </div>
          </div>

          {/* 3. ส่วนราชการ (จาก) & 4. เรียน (ถึง) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>ส่วนราชการ (จาก)</label>
              <input type="text" name="sender" value={formData.sender} onChange={handleMainChange} placeholder="เช่น ศปนม.สพฐ.ตร." className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>เรียน (ถึง)</label>
              <input type="text" name="recipient_to" value={formData.recipient_to} onChange={handleMainChange} placeholder="เช่น ผอ.ศปนม.ตร." className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
            </div>
          </div>

          {/* 5. เรื่อง (หัวข้องาน) */}
          <div>
            <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>หัวข้องาน (Title)</label>
            <input type="text" name="title" value={formData.title} onChange={handleMainChange} placeholder="ระบุหัวข้องานติดตาม..." required className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
          </div>

          {/* รายละเอียดเอกสาร (Main Text) */}
          <div>
            <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>รายละเอียดเอกสาร (Main Text)</label>
            <textarea name="main_text" value={formData.main_text} onChange={handleMainChange} rows={5} placeholder="ระบุรายละเอียดสาระสำคัญของงานติดตาม..." className="mt-1 block w-full p-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
          </div>

          {/* สิ่งที่ต้องดำเนินการ (Task Detail) */}
          <div>
            <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>สิ่งที่ต้องดำเนินการ (Task Detail)</label>
            <textarea name="task_detail" value={formData.task_detail} onChange={handleMainChange} rows={4} placeholder="ระบุสิ่งที่ต้องดำเนินการและติดตามผล..." className="mt-1 block w-full p-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--yellowBorder)", backgroundColor: "var(--yellowBG)", color: "var(--foreground)" }}/>
          </div>
        </div>

        {/* ===== กล่องขวา (สไตล์ Container เดิม) ===== */}
        <div className="lg:col-span-5 flex flex-col gap-5 p-5 sm:p-6 rounded-lg border border-(--wrapper) shadow-[4px_4px_0px_rgba(0,0,0,0.1)] bg-(--container)">
          <h2 className="text-lg font-bold border-b pb-3 border-(--wrapper)" style={{ color: "var(--header)" }}>
            กำหนดเวลา / เลขรับ & ผู้รับผิดชอบ
          </h2>

          {/* แถบที่ 1: เลขรับ (Receive No) + วันที่รับ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>เลขรับ (Receive No)</label>
              <input type="number" name="receive_no" value={formData.receive_no} onChange={handleMainChange} placeholder="ถ้าไม่ระบุ ระบบจะรันเลขอัตโนมัติ" className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>วันที่รับ (จะบันทึกเป็นวันที่เข้าระบบ)</label>
              <input type="date" name="receive_date" value={formData.receive_date} onChange={handleMainChange} className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
            </div>
          </div>

          {/* แถบที่ 2: ระดับความด่วน + ระดับความลับ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>ระดับความด่วน (Urgency Level)</label>
              <select name="urgency_level" value={formData.urgency_level} onChange={handleMainChange} className="mt-1 block w-full h-11 px-3 rounded-md outline-none cursor-pointer text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}>
                <option value="ปกติ">ปกติ</option>
                <option value="ด่วน">ด่วน</option>
                <option value="ด่วนมาก">ด่วนมาก</option>
                <option value="ด่วนที่สุด">ด่วนที่สุด</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>ระดับความลับ (Secret Level)</label>
              <select name="secret_level" value={formData.secret_level} onChange={handleMainChange} className="mt-1 block w-full h-11 px-3 rounded-md outline-none cursor-pointer text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}>
                <option value="ปกติ">ปกติ</option>
                <option value="ลับ">ลับ</option>
                <option value="ลับมาก">ลับมาก</option>
                <option value="ลับที่สุด">ลับที่สุด</option>
              </select>
            </div>
          </div>

          {/* แถบที่ 3: วันครบกำหนด (Due Date) + วันที่ลงนาม (Sign Date) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>วันครบกำหนด (Due Date)</label>
              <input type="datetime-local" name="due_date" value={formData.due_date} onChange={handleMainChange} required className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>วันที่ลงนาม (Sign Date)</label>
              <input type="date" name="sign_date" value={formData.sign_date} onChange={handleMainChange} className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
            </div>
          </div>

          {/* แถบที่ 4: วันประชุม (Meeting Date) + วันส่งแบบตอบรับ (Reply Due Date) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>วันประชุม (Meeting Date)</label>
              <input type="datetime-local" name="meeting_date" value={formData.meeting_date} onChange={handleMainChange} className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>วันส่งแบบตอบรับ (Reply Due Date)</label>
              <input type="datetime-local" name="reply_due_date" value={formData.reply_due_date} onChange={handleMainChange} className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
            </div>
          </div>

          {/* ผู้รับผิดชอบ */}
          <div>
            <label className="block text-sm font-bold mb-2" style={{ color: "var(--header)" }}>ผู้รับผิดชอบ (เลือกได้หลายคน)</label>
            <Select
                isMulti
                options={[
                    { value: "all", label: "เลือกทั้งหมด (ทุกคน)" },
                    ...users.map(u => ({ value: String(u.id || u._id), label: `${u.name} ${u.role ? `(${u.role})` : ''}` }))
                ]}
                value={selectedUsers.includes("all") 
                    ? [{ value: "all", label: "เลือกทั้งหมด (ทุกคน)" }] 
                    : selectedUsers.map(uid => {
                        const u = users.find(x => String(x.id || x._id) === uid);
                        return u ? { value: String(u.id || u._id), label: `${u.name} ${u.role ? `(${u.role})` : ''}` } : null;
                    }).filter(Boolean)}
                onChange={(selectedOptions: any) => {
                    const isAllSelected = selectedOptions?.some((opt: any) => opt.value === "all");
                    if (isAllSelected) {
                        setSelectedUsers(["all"]);
                    } else {
                        setSelectedUsers(selectedOptions ? selectedOptions.map((opt: any) => opt.value) : []);
                    }
                }}
                placeholder="พิมพ์เพื่อค้นหาผู้รับผิดชอบ..."
                className="text-sm cursor-pointer"
                styles={{
                    control: (base) => ({
                        ...base,
                        backgroundColor: 'var(--wrapper)',
                        borderColor: 'var(--shadow)',
                        color: 'var(--foreground)',
                        minHeight: '44px',
                        borderRadius: '0.375rem',
                        padding: '0 0.25rem',
                        cursor: 'pointer'
                    }),
                    menu: (base) => ({
                        ...base,
                        backgroundColor: 'var(--wrapper)',
                        color: 'var(--foreground)',
                        zIndex: 9999
                    }),
                    option: (base, state) => ({
                        ...base,
                        backgroundColor: state.isFocused ? 'var(--button)' : 'transparent',
                        color: 'var(--foreground)',
                        cursor: 'pointer'
                    }),
                    multiValue: (base) => ({
                        ...base,
                        backgroundColor: 'var(--button)',
                        borderRadius: '4px'
                    }),
                    multiValueLabel: (base) => ({
                        ...base,
                        color: 'var(--foreground)',
                        fontWeight: 'bold'
                    })
                }}
            />
          </div>

          {/* กำหนดเป็นงานเร่งด่วน */}
          <div className="flex items-center gap-2 pt-2 border-t border-(--shadow)/30">
            <input type="checkbox" name="is_urgent" checked={formData.is_urgent} onChange={handleMainChange} id="is_urgent" className="w-5 h-5 cursor-pointer" style={{ accentColor: 'var(--redText)' }} />
            <label htmlFor="is_urgent" className="block text-sm font-bold cursor-pointer" style={{ color: "var(--redText)" }}>กำหนดเป็นงานเร่งด่วน (Urgent)</label>
          </div>
        </div>

      </div>

      <div className="flex flex-col sm:flex-row gap-4 w-full pt-4" style={{ borderTop: '1px solid var(--wrapper)' }}>
        <Link href={'/'} className="w-full sm:w-1/3">
          <button type="button" className="w-full py-2.5 px-4 rounded-xl font-bold text-center transition-colors cursor-pointer select-none" style={{ backgroundColor: "var(--button)", color: "var(--header)", border: "1px solid var(--wrapper)" }}>
            กลับหน้าหลัก
          </button>
        </Link>
        <button type="submit" className="flex-1 py-2.5 px-4 rounded-xl font-bold text-lg shadow-sm transition-colors hover:opacity-90 cursor-pointer select-none" style={{ backgroundColor: "var(--greenBG)", color: "var(--greenText)", border: "2px solid var(--greenBorder)" }}>
          บันทึกและส่งข้อมูลการติดตาม
        </button>
      </div>

    </form>
  );
}