"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./SelfAdd.module.css"; 
import Swal from "sweetalert2";
import Select from "react-select";
import { CreatableCombobox } from "../CreatableCombobox";

// ฟังก์ชันหาเวลาอนาคตเพื่อตั้งเป็น default
const getFutureDateStr = (daysToAdd: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysToAdd);
  return d.toISOString().slice(0, 16); // return format "YYYY-MM-DDThh:mm"
};

const DEFAULT_SENDERS = [
  "ศปนม.สพฐ.ตร.",
  "สพฐ.ตร.",
  "ตร.",
  "บช.ก.",
  "บช.น.",
  "ภ.1", "ภ.2", "ภ.3", "ภ.4", "ภ.5", "ภ.6", "ภ.7", "ภ.8", "ภ.9"
];

const DEFAULT_RECIPIENTS = [
  "ผอ.ศปนม.ตร.",
  "ผบก.ศปนม.ตร.",
  "ผบ.ตร.",
  "รอง ผบ.ตร.",
  "ผู้ช่วย ผบ.ตร."
];

export default function MemoForm() {
  const [users, setUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [errors, setErrors] = useState<{ [key: string]: boolean }>({});
  
  const [formData, setFormData] = useState({
    memo_no: "",
    memo_date: "", // ค่าเริ่มต้นว่างเพื่อให้ผู้ใช้เลือก วว/ดด/ปปปป เอง
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
  const [suggestions, setSuggestions] = useState<{ senders: string[]; recipients: string[] }>({ senders: [], recipients: [] });

  const senderOptions = Array.from(new Set([...DEFAULT_SENDERS, ...(suggestions.senders || [])]));
  const recipientOptions = Array.from(new Set([...DEFAULT_RECIPIENTS, ...(suggestions.recipients || [])]));

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

    const fetchSuggestions = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem("token") || document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] : "";
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
        const res = await fetch(`${backendUrl}/api/v1/tasks/suggestions`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
          }
        });
        if (res.ok) {
          const data = await res.json();
          setSuggestions({ senders: data.senders || [], recipients: data.recipients || [] });
        }
      } catch (err) {}
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
    fetchSuggestions();
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

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: false }));
    }
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

    // 💡 ล็อคว่าต้องกรอก 5 ฟิลด์หลักให้ครบถ้วนก่อนบันทึก พร้อมแสดง Custom Validation UI
    const newErrors: { [key: string]: boolean } = {};
    const missingFields: string[] = [];

    if (!formData.memo_no?.trim()) {
      newErrors.memo_no = true;
      missingFields.push("เลขที่ Memo");
    }
    if (!formData.memo_date?.trim()) {
      newErrors.memo_date = true;
      missingFields.push("วันที่ Memo");
    }
    if (!formData.sender?.trim()) {
      newErrors.sender = true;
      missingFields.push("ส่วนราชการ (จาก)");
    }
    if (!formData.recipient_to?.trim()) {
      newErrors.recipient_to = true;
      missingFields.push("เรียน (ถึง)");
    }
    if (!formData.title?.trim()) {
      newErrors.title = true;
      missingFields.push("หัวข้องาน (Title)");
    }

    if (missingFields.length > 0) {
      setErrors(newErrors);
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกข้อมูลให้ครบถ้วน',
        html: `โปรดกรอกข้อมูล 5 รายการจำเป็นต่อไปนี้ให้ครบถ้วนก่อนบันทึก:<br/><br/><div style="color: #e11d48; font-weight: bold; text-align: left; background: #fff1f2; padding: 12px; border-radius: 8px; border: 1px solid #fecdd3;">• ${missingFields.join('<br/>• ')}</div>`,
        confirmButtonText: 'รับทราบ',
        confirmButtonColor: 'var(--header, #1e293b)'
      });
      return;
    }

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

    const currentUserId = typeof window !== 'undefined' ? String(localStorage.getItem("user_id") || localStorage.getItem("userId") || "") : "";

    const normalizeFormDateStr = (dateStr: string) => {
      if (!dateStr) return dateStr;
      const match = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (match) {
        let year = parseInt(match[1], 10);
        if (year > 2400) {
          year -= 543;
          return `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}${dateStr.slice(match[0].length)}`;
        }
      }
      return dateStr;
    };

    const payload = {
      ...formData,
      memo_date: normalizeFormDateStr(formData.memo_date),
      due_date: normalizeFormDateStr(formData.due_date.length === 16 ? `${formData.due_date}:00` : formData.due_date),
      sign_date: normalizeFormDateStr(formData.sign_date),
      meeting_date: normalizeFormDateStr(formData.meeting_date),
      reply_due_date: normalizeFormDateStr(formData.reply_due_date),
      document_id: null,
      assignments: validAssignments,
      created_by: currentUserId,
      createdBy: currentUserId
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
    <form onSubmit={handleSubmit} noValidate className="w-full space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ===== กล่องซ้าย (สไตล์ Container เดิม) ===== */}
        <div className="lg:col-span-7 flex flex-col gap-5 p-5 sm:p-6 rounded-lg border border-(--wrapper) shadow-[4px_4px_0px_rgba(0,0,0,0.1)] bg-(--container)">
          <h2 className="text-lg font-bold border-b pb-3 border-(--wrapper)" style={{ color: "var(--header)" }}>
            ข้อมูลบันทึก / หนังสือ
          </h2>
          
          {/* 1. เลขที่ Memo & 2. วันที่ Memo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>
                เลขที่หนังสือ <span className="text-red-500 font-bold">*</span>
              </label>
              <input
                type="text"
                name="memo_no"
                value={formData.memo_no}
                onChange={handleMainChange}
                placeholder="เช่น 123/2567"
                autoComplete="off"
                className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium transition"
                style={{
                  border: errors.memo_no ? "2px solid #ef4444" : "1px solid var(--wrapper)",
                  backgroundColor: errors.memo_no ? "rgba(239, 68, 68, 0.05)" : "var(--button)",
                  color: "var(--foreground)"
                }}
              />
              {errors.memo_no && (
                <p className="text-xs font-semibold text-red-500 mt-1.5 flex items-center gap-1">
                  ⚠️ โปรดกรอกเลขที่ Memo
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>
                วันที่หนังสือ <span className="text-red-500 font-bold">*</span>
              </label>
              <input
                type="date"
                name="memo_date"
                value={formData.memo_date}
                onChange={handleMainChange}
                autoComplete="off"
                className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium transition"
                style={{
                  border: errors.memo_date ? "2px solid #ef4444" : "1px solid var(--wrapper)",
                  backgroundColor: errors.memo_date ? "rgba(239, 68, 68, 0.05)" : "var(--button)",
                  color: "var(--foreground)"
                }}
              />
              {errors.memo_date && (
                <p className="text-xs font-semibold text-red-500 mt-1.5 flex items-center gap-1">
                  ⚠️ โปรดเลือกวันที่ Memo
                </p>
              )}
            </div>
          </div>

          {/* 3. ส่วนราชการ (จาก) & 4. เรียน (ถึง) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>
                ส่วนราชการ (จาก) <span className="text-red-500 font-bold">*</span>
              </label>
              <CreatableCombobox
                value={formData.sender}
                onChange={(val) => {
                  setFormData(prev => ({ ...prev, sender: val }));
                  if (errors.sender) setErrors(prev => ({ ...prev, sender: false }));
                }}
                options={senderOptions}
                placeholder="เช่น ศปนม.สพฐ.ตร."
                isError={errors.sender}
              />
              {errors.sender && (
                <p className="text-xs font-semibold text-red-500 mt-1.5 flex items-center gap-1">
                  ⚠️ โปรดระบุส่วนราชการ (จาก)
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>
                เรียน (ถึง) <span className="text-red-500 font-bold">*</span>
              </label>
              <CreatableCombobox
                value={formData.recipient_to}
                onChange={(val) => {
                  setFormData(prev => ({ ...prev, recipient_to: val }));
                  if (errors.recipient_to) setErrors(prev => ({ ...prev, recipient_to: false }));
                }}
                options={recipientOptions}
                placeholder="เช่น ผอ.ศปนม.ตร."
                isError={errors.recipient_to}
              />
              {errors.recipient_to && (
                <p className="text-xs font-semibold text-red-500 mt-1.5 flex items-center gap-1">
                  ⚠️ โปรดระบุเรียน (ถึง)
                </p>
              )}
            </div>
          </div>

          {/* 5. เรื่อง (หัวข้องาน) */}
          <div>
            <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>
              หัวข้องาน (Title) <span className="text-red-500 font-bold">*</span>
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleMainChange}
              placeholder="ระบุหัวข้องานติดตาม..."
              autoComplete="off"
              className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium transition"
              style={{
                border: errors.title ? "2px solid #ef4444" : "1px solid var(--wrapper)",
                backgroundColor: errors.title ? "rgba(239, 68, 68, 0.05)" : "var(--button)",
                color: "var(--foreground)"
              }}
            />
            {errors.title && (
              <p className="text-xs font-semibold text-red-500 mt-1.5 flex items-center gap-1">
                ⚠️ โปรดกรอกหัวข้องาน (Title)
              </p>
            )}
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
              <input type="datetime-local" name="due_date" value={formData.due_date} onChange={handleMainChange} autoComplete="off" className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>วันที่ลงนาม (Sign Date)</label>
              <input type="date" name="sign_date" value={formData.sign_date} onChange={handleMainChange} autoComplete="off" className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
            </div>
          </div>

          {/* แถบที่ 4: วันประชุม (Meeting Date) + วันส่งแบบตอบรับ (Reply Due Date) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>วันประชุม (Meeting Date)</label>
              <input type="datetime-local" name="meeting_date" value={formData.meeting_date} onChange={handleMainChange} autoComplete="off" className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: "var(--header)" }}>วันส่งแบบตอบรับ (Reply Due Date)</label>
              <input type="datetime-local" name="reply_due_date" value={formData.reply_due_date} onChange={handleMainChange} autoComplete="off" className="mt-1 block w-full h-11 px-3 rounded-md outline-none text-sm font-medium" style={{ border: "1px solid var(--wrapper)", backgroundColor: "var(--button)", color: "var(--foreground)" }}/>
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