"use client"

import styles from "./Details.module.css"
import Select from "react-select";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { CreatableCombobox } from "../CreatableCombobox";

type TaskStatus = "following" | "problem" | "completed";

type TaskItemProps = {
  taskData: any;
  setTaskData: any;
  isEditing: boolean;
  setIsEditing: (val: boolean) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onUpdateTask: () => void;
  onDeleteTask: () => void;
};

type StatusOption = {
  value: TaskStatus;
  label: string;
};

export default function DetailsPanel({
    taskData,
    setTaskData,
    isEditing,
    setIsEditing,
    onStatusChange,
    onUpdateTask,
    onDeleteTask
}: TaskItemProps) {
    const router = useRouter();
    const [taskStatus, setStatus] = useState<TaskStatus>((taskData?.status as TaskStatus) || "following");
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [users, setUsers] = useState<any[]>([]);
    const [suggestions, setSuggestions] = useState<{ senders: string[]; recipients: string[] }>({ senders: [], recipients: [] });

    useEffect(() => {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
        fetch(`${backendUrl}/api/v1/tasks/suggestions`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setSuggestions({ senders: data.senders || [], recipients: data.recipients || [] });
                }
            })
            .catch(() => {});
    }, []);

    
    // 💡 ฟังก์ชันตรวจสอบสถานะ Login ที่ถูกต้องแม่นยำ
    const getValidToken = () => {
        if (typeof window === 'undefined') return null;
        const localToken = localStorage.getItem("token");
        const cookieToken = document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
        return (localToken && localToken !== "undefined") ? localToken : (cookieToken || null);
    };

    useEffect(() => {
        if (taskData?.status) setStatus(taskData.status as TaskStatus);
        const token = getValidToken();
        setIsLoggedIn(!!token);
        
        if (token) {
            fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003"}/api/v1/auth/me`, {
                headers: { Authorization: `Bearer ${token}` }
            }).then(res => res.json()).then(data => {
                if (data.success) setCurrentUser(data.data);
            }).catch(() => {});
            
            fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003"}/api/v1/users`, {
                headers: { Authorization: `Bearer ${token}` }
            }).then(res => res.json()).then(data => {
                if (data.success) setUsers(data.data);
            }).catch(() => {});
        }
    }, [taskData?.status]);

    const handleUserSelect = (uid: string, checked: boolean) => {
        let currentAssignments = Array.isArray(taskData.assignments) ? [...taskData.assignments] : [];
        if (uid === "all") {
            if (checked) {
                currentAssignments = [{ user_id: null, role_or_name: "all" }];
            } else {
                currentAssignments = [];
            }
        } else {
            // Remove "all" if present
            currentAssignments = currentAssignments.filter(a => a.role_or_name !== "all");
            
            if (checked) {
                const matchedUser = users.find(u => String(u.id || u._id) === uid);
                if (matchedUser) {
                    currentAssignments.push({ user_id: matchedUser.id || matchedUser._id, role_or_name: matchedUser.name });
                }
            } else {
                currentAssignments = currentAssignments.filter(a => String(a.user_id) !== uid);
            }
        }
        setTaskData({ ...taskData, assignments: currentAssignments });
    };

    const isUserSelected = (uid: string) => {
        if (!taskData?.assignments) return false;
        if (uid === "all") return taskData.assignments.some((a: any) => a.role_or_name === "all");
        return taskData.assignments.some((a: any) => String(a.user_id) === uid);
    };

    const checkAuthAndExecute = (action: () => void) => {
        if (!getValidToken()) {
            Swal.fire({
                icon: 'warning',
                title: 'ต้องเข้าสู่ระบบ',
                text: 'คุณต้องเข้าสู่ระบบก่อนจึงจะสามารถจัดหรือแก้ไขข้อมูลนี้ได้',
                confirmButtonText: 'ไปหน้าเข้าสู่ระบบ',
                showCancelButton: true,
                cancelButtonText: 'ยกเลิก'
            }).then((result) => {
                if (result.isConfirmed) {
                    router.push('/login');
                }
            });
            return;
        }

        if (currentUser?.role === 'user') {
             Swal.fire({
                 icon: 'error',
                 title: 'ไม่มีสิทธิ์เข้าถึง',
                 text: 'บัญชีของคุณเป็นเพียงผู้เยี่ยมชม ไม่สามารถแก้ไขข้อมูลได้'
             });
             return;
        }

        if (currentUser?.role === 'admin') {
            const isCreator = String(taskData?.created_by) === String(currentUser?.id);
            if (!isCreator) {
                Swal.fire({
                    icon: 'error',
                    title: 'ไม่มีสิทธิ์เข้าถึง',
                    text: 'คุณสามารถแก้ไขได้เฉพาะงานที่คุณสร้างเท่านั้น'
                });
                return;
            }
        }

        action();
    };

    const parsedDate = new Date(taskData?.date || "");
    const isValidDate = !isNaN(parsedDate.getTime());

    const day = isValidDate ? parsedDate.getDate() : "-";
    const monthYear = isValidDate ? parsedDate.toLocaleDateString("th-TH", { month: "long", year: "numeric" }) : "ไม่ระบุ";
    const timeText = isValidDate ? parsedDate.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "";

    const now = new Date();
    const diffTime = isValidDate ? parsedDate.getTime() - now.getTime() : 0;
    const diffTotalMinutes = Math.floor(diffTime / (1000 * 60));
    const diffTotalHours = Math.floor(diffTotalMinutes / 60);
    const diffDays = Math.floor(diffTotalHours / 24);

    let theme = styles.DateGreen;
    if (!isValidDate) theme = styles.DateGrey;
    else if (diffTotalMinutes < 0) theme = styles.DateGrey;
    else if (diffDays === 0) theme = styles.DateRed;
    else if (diffDays <= 2) theme = styles.DateOrange;
    else if (diffDays <= 7) theme = styles.DateYellow;

    let timeRemainingDisplay = "";
    if (!isValidDate) {
        timeRemainingDisplay = "ไม่ระบุกำหนดการ";
    } else if (diffTotalMinutes < 0) {
        const absMinutes = Math.abs(diffTotalMinutes);
        const absHours = Math.floor(absMinutes / 60);
        const rDays = Math.floor(absHours / 24);
        if (rDays > 0) timeRemainingDisplay = `เกินกำหนด ${rDays} วัน`;
        else timeRemainingDisplay = `เกินกำหนด ${absHours} ชม. ${absMinutes % 60} นาที`;
    } else {
        if (diffDays >= 1) timeRemainingDisplay = `เหลืออีก ${diffDays} วัน`;
        else timeRemainingDisplay = `เหลืออีก ${diffTotalHours} ชม. ${diffTotalMinutes % 60} นาที`;
    }

    const formatForInput = (dateStr: string) => {
        if (!dateStr) return "";
        if (typeof dateStr === 'string' && dateStr.length === 16 && dateStr.includes("T")) {
            return dateStr; 
        }
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return "";
        const pad = (n: number) => n.toString().padStart(2, '0');
        let year = d.getFullYear();
        if (year > 2400) year -= 543;
        return `${year}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const toDateInputValue = (value?: string | null) => {
        if (!value) return "";
        let str = String(value).trim();
        if (!str) return "";
        const match = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (match) {
            let year = parseInt(match[1], 10);
            if (year > 2400) year -= 543;
            return `${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
        }
        const d = new Date(str);
        if (isNaN(d.getTime())) return "";
        let year = d.getFullYear();
        if (year > 2400) year -= 543;
        const m = (d.getMonth() + 1).toString().padStart(2, "0");
        const day = d.getDate().toString().padStart(2, "0");
        return `${year}-${m}-${day}`;
    };

    const statusOption: StatusOption[] = [
        { value: "following", label: "กำลังติดตาม" },
        { value: "problem", label: "ติดปัญหา" },
        { value: "completed", label: "เสร็จสิ้น" },
    ];

    const selectThemeMap = {
        following: { color: "var(--yellowText)", bg: "var(--yellowBG)", border: "var(--yellowBorder)" },
        problem: { color: "var(--redText)", bg: "var(--redBG)", border: "var(--redBorder)" },
        completed: { color: "var(--greenText)", bg: "var(--greenBG)", border: "var(--greenBorder)" },
    } as const;

    const themeStyle = selectThemeMap[taskStatus] || selectThemeMap["following"];

    return (
        <div className="flex flex-col w-full h-full gap-6 justify-between min-h-140">
            <div className={styles.ContentWrapper}>
                <div className={styles.ContentContainer}>
                    <div className={styles.ContentHeader}>
                        <div className={styles.InfoContainer}>
                            <div className={`${styles.DateDisplayer} ${theme}`}>
                                <span>กำหนดติดตาม</span>
                                <span className={styles.DateNumber}>{day}</span>
                                <span className={styles.DateMonth}>{monthYear}</span>
                            </div>
                            <div className={styles.Content}>
                                {isEditing ? (
                                    <input 
                                        type="text" 
                                        className={styles.CustomSelect}
                                        style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}
                                        value={taskData?.name || ""} 
                                        onChange={(e) => setTaskData({ ...taskData, name: e.target.value })} 
                                    />
                                ) : (
                                    <h1 className={styles.Header}>{taskData?.name}</h1>
                                )}
                                <div className={styles.DetailContainer}>
                                    <div className={styles.DetailedContainer}>
                                        
                                        <div className="flex flex-row items-center flex-wrap gap-2">
                                            <strong>ผู้รับผิดชอบรวม: &nbsp; </strong> 
                                            <span className={styles.TextArea} style={{ padding: '0.2rem 0.6rem', fontWeight: 'bold' }}>
                                                {taskData?.personInCharge || "ไม่ระบุ"}
                                            </span>
                                        </div>
                                        
                                        
                                        {isEditing ? (
                                            <div className="flex flex-col gap-2 mt-2 w-full">
                                                <div className="flex flex-col mt-2 mb-2 w-full">
                                                    <strong className="mb-2 block">เปลี่ยนผู้รับผิดชอบ (เลือกได้หลายคน): </strong>
                                                    <Select
                                                        isMulti
                                                        options={[
                                                            { value: "all", label: "📢 เลือกทั้งหมด (ทุกคน)" },
                                                            ...users.map(u => ({ value: String(u.id || u._id), label: `${u.name} ${u.role ? `(${u.role})` : ''}` }))
                                                        ]}
                                                        value={taskData?.assignments?.map((a: any) => {
                                                            if (a.role_or_name === "all") return { value: "all", label: "📢 เลือกทั้งหมด (ทุกคน)" };
                                                            const user = users.find(u => String(u.id || u._id) === String(a.user_id) || u.name === a.role_or_name);
                                                            if (user) return { value: String(user.id || user._id), label: `${user.name} ${user.role ? `(${user.role})` : ''}` };
                                                            return { value: a.user_id || a.role_or_name, label: a.role_or_name || a.personInCharge || "ไม่ระบุ" };
                                                        }).filter((opt: any) => opt && opt.value) || []}
                                                        onChange={(selectedOptions: any) => {
                                                            const isAllSelected = selectedOptions?.some((opt: any) => opt.value === "all");
                                                            if (isAllSelected) {
                                                                setTaskData({ ...taskData, assignments: [{ user_id: null, role_or_name: "all" }] });
                                                            } else {
                                                                setTaskData({
                                                                    ...taskData,
                                                                    assignments: selectedOptions ? selectedOptions.map((opt: any) => {
                                                                        const matchedUser = users.find(u => String(u.id || u._id) === opt.value || u.name === opt.value);
                                                                        return matchedUser 
                                                                            ? { user_id: matchedUser.id || matchedUser._id, role_or_name: matchedUser.name, color: matchedUser.color } 
                                                                            : { user_id: null, role_or_name: opt.value || opt.label };
                                                                    }) : []
                                                                });
                                                            }
                                                        }}
                                                        placeholder="🔍 พิมพ์เพื่อค้นหาผู้รับผิดชอบ..."
                                                        className="text-sm"
                                                        styles={{
                                                            control: (base) => ({
                                                                ...base,
                                                                backgroundColor: 'var(--wrapper)',
                                                                borderColor: 'var(--shadow)',
                                                                color: 'var(--foreground)',
                                                                padding: '0.1rem'
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
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <strong>เปลี่ยนกำหนดส่ง: </strong>
                                                    <input 
                                                        type="datetime-local" 
                                                        className={styles.CustomSelect}
                                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                                        value={taskData?.date ? formatForInput(taskData.date) : ""} 
                                                        onChange={(e) => {
                                                            setTaskData({ ...taskData, date: e.target.value });
                                                        }} 
                                                    />
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <strong>ชั้นความเร็ว: </strong>
                                                    <select
                                                        className={styles.CustomSelect}
                                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                                        value={taskData?.urgency_level || ""}
                                                        onChange={(e) => setTaskData({ ...taskData, urgency_level: e.target.value })}
                                                    >
                                                        <option value="">ปกติ (ไม่ระบุ)</option>
                                                        <option value="ด่วน">ด่วน</option>
                                                        <option value="ด่วนมาก">ด่วนมาก</option>
                                                        <option value="ด่วนที่สุด">ด่วนที่สุด</option>
                                                    </select>
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <strong>ชั้นความลับ: </strong>
                                                    <select
                                                        className={styles.CustomSelect}
                                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                                        value={taskData?.secret_level || ""}
                                                        onChange={(e) => setTaskData({ ...taskData, secret_level: e.target.value })}
                                                    >
                                                        <option value="">ปกติ (ไม่ระบุ)</option>
                                                        <option value="ลับ">ลับ</option>
                                                        <option value="ลับมาก">ลับมาก</option>
                                                        <option value="ลับที่สุด">ลับที่สุด</option>
                                                    </select>
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <strong>วันนัดประชุม: </strong>
                                                    <input 
                                                        type="date" 
                                                        className={styles.CustomSelect}
                                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                                        value={toDateInputValue(taskData?.meeting_date)} 
                                                        onChange={(e) => setTaskData({ ...taskData, meeting_date: e.target.value })} 
                                                    />
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <strong>วันนัดส่งแบบตอบรับ (ประชุม): </strong>
                                                    <input 
                                                        type="date" 
                                                        className={styles.CustomSelect}
                                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                                        value={toDateInputValue(taskData?.reply_due_date)} 
                                                        onChange={(e) => setTaskData({ ...taskData, reply_due_date: e.target.value })} 
                                                    />
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <strong>ที่ (เลขที่หนังสือ): </strong>
                                                    <input 
                                                        type="text" 
                                                        className={styles.CustomSelect}
                                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                                        value={taskData?.memo_no || ""} 
                                                        onChange={(e) => setTaskData({ ...taskData, memo_no: e.target.value })} 
                                                    />
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <strong>วันที่ (วันที่หนังสือ): </strong>
                                                    <input 
                                                        type="date" 
                                                        className={styles.CustomSelect}
                                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                                        value={toDateInputValue(taskData?.memo_date)} 
                                                        onChange={(e) => setTaskData({ ...taskData, memo_date: e.target.value })} 
                                                    />
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <strong>ถึง (เรียน): </strong>
                                                    <input 
                                                        type="text" 
                                                        className={styles.CustomSelect}
                                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                                        value={taskData?.recipient_to || ""} 
                                                        onChange={(e) => setTaskData({ ...taskData, recipient_to: e.target.value })} 
                                                    />
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <strong>เลขรับ: </strong>
                                                    <input 
                                                        type="number" 
                                                        className={styles.CustomSelect}
                                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                                        value={taskData?.receive_no || ""} 
                                                        onChange={(e) => setTaskData({ ...taskData, receive_no: e.target.value })} 
                                                    />
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <strong>วันที่ลงนาม: </strong>
                                                    <input 
                                                        type="date" 
                                                        className={styles.CustomSelect}
                                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                                        value={toDateInputValue(taskData?.sign_date)} 
                                                        onChange={(e) => setTaskData({ ...taskData, sign_date: e.target.value })} 
                                                    />
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <strong>เปลี่ยนกำหนดส่ง: </strong>
                                                    <input 
                                                        type="datetime-local" 
                                                        className={styles.CustomSelect}
                                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                                        value={taskData?.date ? formatForInput(taskData.date) : ""} 
                                                        onChange={(e) => {
                                                            setTaskData({ ...taskData, date: e.target.value });
                                                        }} 
                                                    />
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <strong>ชั้นความเร็ว: </strong>
                                                    <select
                                                        className={styles.CustomSelect}
                                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                                        value={taskData?.urgency_level || ""}
                                                        onChange={(e) => setTaskData({ ...taskData, urgency_level: e.target.value })}
                                                    >
                                                        <option value="">ปกติ (ไม่ระบุ)</option>
                                                        <option value="ด่วน">ด่วน</option>
                                                        <option value="ด่วนมาก">ด่วนมาก</option>
                                                        <option value="ด่วนที่สุด">ด่วนที่สุด</option>
                                                    </select>
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                                    <strong>ชั้นความลับ: </strong>
                                                    <select
                                                        className={styles.CustomSelect}
                                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                                        value={taskData?.secret_level || ""}
                                                        onChange={(e) => setTaskData({ ...taskData, secret_level: e.target.value })}
                                                    >
                                                        <option value="">ปกติ (ไม่ระบุ)</option>
                                                        <option value="ลับ">ลับ</option>
                                                        <option value="ลับมาก">ลับมาก</option>
                                                        <option value="ลับที่สุด">ลับที่สุด</option>
                                                    </select>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-1 mt-3">
                                                <p className="flex flex-row flex-wrap gap-2 mb-2">
                                                    {taskData?.urgency_level && (
                                                        <span style={{ fontWeight: 'bold', color: 'var(--redText)', backgroundColor: 'var(--redBG)', padding: '0.2rem 0.8rem', borderRadius: '1rem', fontSize: '0.85rem' }}>
                                                            🔥 {taskData.urgency_level}
                                                        </span>
                                                    )}
                                                    {taskData?.secret_level && (
                                                        <span style={{ fontWeight: 'bold', color: 'var(--blueText)', backgroundColor: '#DBEAFE', padding: '0.2rem 0.8rem', borderRadius: '1rem', fontSize: '0.85rem' }}>
                                                            🔒 {taskData.secret_level}
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="flex flex-row">
                                                    <strong>กำหนดส่ง: &nbsp; </strong> 
                                                    {isValidDate ? `${day} ${monthYear} เวลา ${timeText} น.` : "ไม่ระบุ"}
                                                </p>
                                                
                                                {taskData?.meeting_date && (
                                                    <p className="flex flex-row" style={{ color: 'var(--blueText)' }}>
                                                        <strong>📅 วันนัดประชุม: &nbsp; </strong> 
                                                        {new Date(taskData.meeting_date).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
                                                    </p>
                                                )}
                                                {taskData?.reply_due_date && (
                                                    <p className="flex flex-row" style={{ color: 'var(--redText)' }}>
                                                        <strong>📩 วันนัดส่งแบบตอบรับ: &nbsp; </strong> 
                                                        {new Date(taskData.reply_due_date).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
                                                    </p>
                                                )}
                                                {taskData?.receive_no && (
                                                    <p className="flex flex-row mt-2" style={{ color: 'var(--foreground)' }}>
                                                        <strong>📝 เลขรับ: &nbsp; </strong> 
                                                        {taskData.receive_no}
                                                        {taskData.receive_year ? `/${taskData.receive_year > 2400 ? taskData.receive_year : taskData.receive_year + 543}` : ''}
                                                        {taskData.round ? ` (รอบ ${taskData.round})` : ''}
                                                    </p>
                                                )}
                                                {taskData?.createdAt && (
                                                    <p className="flex flex-row" style={{ color: 'var(--foreground)' }}>
                                                        <strong>📅 วันที่นำเข้าสู่ระบบ: &nbsp; </strong> 
                                                        {new Date(taskData.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
                                                    </p>
                                                )}
                                                {taskData?.sign_date && (
                                                    <p className="flex flex-row mt-2" style={{ color: 'var(--foreground)' }}>
                                                        <strong>✒️ วันที่ลงนาม: &nbsp; </strong> 
                                                        {new Date(taskData.sign_date).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
                                                    </p>
                                                )}

                                                <p className="flex flex-row text-sm mt-1" style={{ color: "var(--header)" }}>
                                                    <strong>สถานะเวลา: &nbsp; </strong>  
                                                    <span style={{ fontWeight: 'bold', color: diffTotalMinutes < 0 ? 'var(--redText)' : 'var(--blueText)' }}>
                                                        {timeRemainingDisplay}
                                                    </span>
                                                </p>
                                                {taskData?.isUrgent && (
                                                    <p className="flex flex-row text-sm mt-1">
                                                        <span style={{ fontWeight: 'bold', color: 'var(--redText)', backgroundColor: 'var(--redBG)', padding: '0.1rem 0.6rem', borderRadius: '0.4rem' }}>
                                                            🔥 งานเร่งด่วน
                                                        </span>
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4 mt-6 pt-6" style={{ borderTop: '1px solid var(--wrapper)' }}>
                            <div className={styles.InteractionContainer}>
                                <label className="min-w-17.5"><strong>สถานะ : </strong></label>
                                <div className={styles.SelectWrapper}>
                                    <Select
                                        instanceId={`task-status-${taskData?.id}`}
                                        options={statusOption}
                                        value={statusOption.find((option) => option.value === taskStatus)}
                                        isClearable={false}
                                        onChange={(selectedOption) => {
                                            checkAuthAndExecute(() => {
                                                const newStatus = selectedOption!.value;
                                                setStatus(newStatus);
                                                onStatusChange(taskData?.id?.toString(), newStatus);
                                            });
                                        }}
                                        menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                                        isSearchable={false}
                                        styles={{
                                            control: (base) => ({
                                            ...base,
                                            padding: "0.2rem 0.5rem",
                                            boxShadow: "none", 
                                            borderRadius: "0.7rem",
                                            backgroundColor: themeStyle.bg,
                                            border: `2px solid ${themeStyle.border}`,
                                            color: themeStyle.color
                                            }),
                                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                            singleValue: (base) => ({ ...base, textAlign: "center", color: themeStyle.color }),
                                            dropdownIndicator: (base) => ({ ...base, color: themeStyle.color }),
                                            indicatorSeparator: (base) => ({ ...base, display: "none" }),
                                            option: (base, state) => {
                                                const theme = selectThemeMap[state.data.value as keyof typeof selectThemeMap];
                                                return {
                                                ...base,
                                                backgroundColor: state.isFocused ? theme.bg : "var(--button)",
                                                color: theme.color,
                                                cursor: "pointer",
                                                ":active": { backgroundColor: theme.bg },
                                                };
                                            },
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 mt-2">
                                <label><strong>บันทึกเพิ่มเติม : </strong></label>
                                <textarea 
                                    className={styles.TextArea}
                                    style={{ padding: '0.6rem', color: 'var(--header)', outline: 'none' }}
                                    rows={4} 
                                    value={taskData?.notes || ""} 
                                    onChange={(e) => {
                                        if (isLoggedIn) setTaskData({ ...taskData, notes: e.target.value });
                                    }}
                                    placeholder={isLoggedIn ? "พิมพ์บันทึกเพิ่มเติมที่นี่..." : "🔒 กรุณาเข้าสู่ระบบเพื่อแก้ไขข้อความบันทึกเพิ่มเติม"}
                                    disabled={!isLoggedIn} // 💡 ล็อกช่องพิมพ์ทันทีถ้าไม่ได้ Login
                                ></textarea>
                                <button className={styles.Clickable} onClick={() => checkAuthAndExecute(onUpdateTask)}>บันทึกข้อมูลและบันทึกเพิ่มเติม</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 w-full mt-4">
                <Link href={'/'} className="w-full sm:w-1/3">
                    <button className={styles.ButtonBack}>กลับหน้าหลัก</button>
                </Link>
                <div className="flex flex-row gap-4 flex-1">
                    {isEditing ? (
                        <button 
                            className={`${styles.Clickable} ${styles.Green}`} 
                            onClick={() => checkAuthAndExecute(onUpdateTask)}
                        >
                            ตกลง (บันทึกข้อมูล)
                        </button>
                    ) : (
                        <button 
                            className={`${styles.Clickable} ${styles.Yellow}`} 
                            onClick={() => checkAuthAndExecute(() => setIsEditing(true))}
                        >
                            แก้ไขข้อมูล
                        </button>
                    )}
                    <button className={`${styles.Clickable} ${styles.Red}`} onClick={() => checkAuthAndExecute(onDeleteTask)}>ลบงานติดตามนี้</button>
                </div>
            </div>
        </div>
    );
}