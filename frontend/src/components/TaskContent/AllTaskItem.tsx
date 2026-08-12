"use client"

import styles from "./TaskItem.module.css"
import Select from "react-select";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

type AssigneeData = {
  name: string;
  color: string;
};

type TaskItemProps = {
  date: string;
  createdAt?: string; 
  name: string;
  personInCharge: string;
  assigneesData?: AssigneeData[]; 
  status: string;
  id: string;
  urgency_level?: string;
  secret_level?: string;
  meeting_date?: string;
  reply_due_date?: string;
  receive_no?: number;
  receive_year?: number;
  onStatusChange: (id: string, status: TaskStatus) => void;
};

type TaskStatus = "following" | "problem" | "completed";

type StatusOption = {
  value: TaskStatus;
  label: string;
};

export default function AllTaskItem({date, createdAt, name, personInCharge, assigneesData, status, id, urgency_level, secret_level, meeting_date, reply_due_date, receive_no, receive_year, onStatusChange}:TaskItemProps){
    const router = useRouter();
    
    const parsedDate = new Date(date);
    const day = parsedDate.getDate();
    const monthYear = parsedDate.toLocaleDateString("th-TH", {
        month: "long",
        year: "numeric",
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dueDateForDiff = new Date(parsedDate);
    dueDateForDiff.setHours(0, 0, 0, 0);

    const diffTime = dueDateForDiff.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let urgency = "";
    let theme;
    let progressColor = "bg-green-500"; 

    if (diffDays < 0) {
        urgency = "late"; theme = styles.DateGrey; progressColor = "var(--greyBorder)";
    } else if (diffDays === 0) {
        urgency = "today"; theme = styles.DateRed; progressColor = "var(--redBorder)";
    } else if (diffDays === 1) {
        urgency = "tommorrow"; theme = styles.DateOrange; progressColor = "var(--orangeBorder)";
    } else if (diffDays <= 7) {
        urgency = "this week"; theme = styles.DateYellow; progressColor = "var(--yellowBorder)";
    } else {
        urgency = "later"; theme = styles.DateGreen; progressColor = "var(--greenBorder)";
    }

    let progressPercent = 0;
    const nowTime = new Date().getTime();
    const dueTime = parsedDate.getTime();

    if (createdAt) {
        const createdTime = new Date(createdAt).getTime();
        
        if (!isNaN(createdTime) && !isNaN(dueTime)) {
            const totalDuration = dueTime - createdTime; 
            const elapsed = nowTime - createdTime;       
            
            if (totalDuration > 0) {
                progressPercent = (elapsed / totalDuration) * 100;
            } else {
                progressPercent = 100; 
            }
        }
    } else {
        progressPercent = diffDays <= 0 ? 100 : Math.max(0, 100 - (diffDays * 10));
    }

    if (isNaN(progressPercent)) progressPercent = 0;
    progressPercent = Math.max(0, Math.min(100, progressPercent));

    const [taskStatus, setStatus] = useState<TaskStatus>((status as TaskStatus) || "following");

    useEffect(() => {
        if (status) {
            setStatus(status as TaskStatus);
        }
    }, [status]);

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

    const themeStyle = selectThemeMap[taskStatus] || selectThemeMap.following;

    const getTextColor = (bgColor: string) => {
        if (!bgColor || !bgColor.startsWith('#')) return '#1f2937'; 
        const hex = bgColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 128) ? '#1f2937' : '#ffffff';
    };
    
    const getBadgeStyle = (level: string | undefined, type: 'urgency' | 'secret') => {
        const val = level?.trim() || "";
        if (val === "" || val === "ไม่มี" || val === "ปกติ") {
            return {
                color: 'var(--greenText)',
                bg: 'var(--greenBG)',
                icon: type === 'urgency' ? '✅' : '🟢',
                label: val || 'ปกติ'
            };
        }
        if (val === "ด่วนที่สุด" || val === "ลับที่สุด") {
            return {
                color: 'var(--redText)',
                bg: 'var(--redBG)',
                icon: type === 'urgency' ? '🚨' : '🔴',
                label: val
            };
        }
        if (val === "ด่วนมาก" || val === "ลับมาก") {
            return {
                color: '#c2410c', // Orange 700
                bg: '#ffedd5',    // Orange 100
                icon: type === 'urgency' ? '⏳' : '🟠',
                label: val
            };
        }
        return {
            color: 'var(--yellowText)',
            bg: 'var(--yellowBG)',
            icon: type === 'urgency' ? '⚡' : '🟡',
            label: val
        };
    };

    const urgencyStyle = getBadgeStyle(urgency_level, 'urgency');
    const secretStyle = getBadgeStyle(secret_level, 'secret');

    
    return(
        <div className={styles.TaskWrapper}>
            <div className={styles.InnerWrapper}>
                <div className={styles.InfoContainer}>
                    <div className={`${styles.DateDisplayer} ${theme}`}>
                        <span className="whitespace-nowrap">กำหนดติดตาม</span>
                        <span className={styles.DateNumber}>{day}</span>
                        <span className={styles.DateMonth}>{monthYear}</span>
                    </div>

                    <div className={`${styles.Content} w-full min-w-0`}>
                        <h1 className={styles.Header} title={name}>
                            {receive_no && receive_year ? (
                                <span className="text-gray-500 mr-2 text-sm sm:text-base font-normal">[{receive_no}/{receive_year + 543}]</span>
                            ) : null}
                            {name}
                        </h1>
                        <p className="flex flex-row flex-wrap gap-2 mt-1 mb-1">
                            <span style={{ fontWeight: 'bold', color: urgencyStyle.color, backgroundColor: urgencyStyle.bg, padding: '0.1rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', border: `1px solid ${urgencyStyle.color}` }}>
                                {urgencyStyle.icon} ชั้นความเร็ว: {urgencyStyle.label}
                            </span>
                            <span style={{ fontWeight: 'bold', color: secretStyle.color, backgroundColor: secretStyle.bg, padding: '0.1rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', border: `1px solid ${secretStyle.color}` }}>
                                {secretStyle.icon} ชั้นความลับ: {secretStyle.label}
                            </span>
                        </p>

                        {(meeting_date || reply_due_date) && (
                            <div className="flex flex-col gap-1 mb-2 text-xs sm:text-sm">
                                {meeting_date && (
                                    <p style={{ color: 'var(--blueText)' }}>
                                        <strong>📅 วันนัดประชุม: &nbsp; </strong> 
                                        {new Date(meeting_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                                    </p>
                                )}
                                {reply_due_date && (
                                    <p style={{ color: 'var(--redText)' }}>
                                        <strong>📩 วันนัดส่งแบบตอบรับ: &nbsp; </strong> 
                                        {new Date(reply_due_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className={`${styles.DetailContainer} mt-2 w-full pr-4 flex flex-col`}>
                            
                            <div className="flex flex-wrap gap-1.5">
                                {assigneesData && assigneesData.length > 0 ? (
                                    assigneesData.map((assignee, idx) => {
                                        const hex = assignee.color.replace('#', '');
                                        const r = parseInt(hex.substring(0,2),16);
                                        const g = parseInt(hex.substring(2,4),16);
                                        const b = parseInt(hex.substring(4,6),16);

                                        // คำนวณ luminance เพื่อเลือกตัวอักษรขาวหรือดำ
                                        const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
                                        const onColor = luminance > 0.5 ? '0,0,0' : '255,255,255';

                                        return (
                                            <span
                                            key={idx}
                                            className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap assignee-badge"
                                            style={{
                                                ['--badge-bg-light' as string]: `rgba(${r},${g},${b},0.15)`,
                                                ['--badge-bg-dark' as string]:  `rgba(${r},${g},${b},0.85)`,
                                                ['--badge-border-light' as string]: `rgba(${r},${g},${b},0.4)`,
                                                ['--badge-border-dark' as string]:  `rgba(${r},${g},${b},0.9)`,
                                                ['--badge-text-light' as string]: `rgba(${r*0.4},${g*0.4},${b*0.4},1)`,
                                                ['--badge-text-dark' as string]:  `rgba(${onColor},1)`,
                                            } as React.CSSProperties}
                                            >
                                            <span
                                                className="w-2 h-2 rounded-full flex-shrink-0 badge-dot"
                                                style={{ 
                                                    ['--dot-color' as string]: assignee.color,
                                                } as React.CSSProperties}
                                                ></span>
                                            {assignee.name}
                                            </span>
                                        );
                                    })
                                    ) : (
                                    personInCharge.split(',').map((person, idx) => (
                                        <span 
                                            key={idx} 
                                            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs sm:text-sm font-bold whitespace-nowrap shadow-sm bg-(--wrapper) text-foreground"
                                        >
                                            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-400"></span>
                                            {person.trim()}
                                        </span>
                                    ))
                                )}
                            </div>
                            <p className="flex flex-col sm:flex-row mb-1 text-sm whitespace-nowrap">
                                <strong>สถานะระยะเวลา: &nbsp; </strong>  
                                <span>{diffDays < 0
                                    ? `เกินกำหนด ${Math.abs(diffDays)} วัน`
                                    : diffDays === 0
                                    ? "ครบกำหนดวันนี้"
                                    : `เหลืออีก ${diffDays} วัน`}</span>
                            </p>

                            <div className="w-full shrink-0 block bg-(--wrapper) rounded-full h-2.5 mt-2 border border-(--shadow) overflow-hidden">
                                <div 
                                    className="h-full rounded-full transition-all duration-500 ease-in-out" 
                                    style={{ 
                                        width: `${progressPercent}%`,
                                        backgroundColor: progressColor 
                                    }}
                                ></div>
                            </div>

                        </div>
                    </div>
                </div>

                <div className={styles.ButtonContainer}>
                    <div className={styles.SelectWrapper}>
                        <Select
                            instanceId={`task-status-${id}`}
                            options={statusOption}
                            aria-label={`อัปเดตสถานะงานของ ${name}`}
                            value={statusOption.find((option) => option.value === taskStatus) || statusOption[0]}
                            isClearable={false}
                            onChange={(selectedOption) => {
                                // 💡 ดักความถูกต้องของ Token ก่อนให้เปลี่ยนค่าใน Dropdown หน้ารวม
                                const localToken = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
                                const cookieToken = document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
                                const token = (localToken && localToken !== "undefined") ? localToken : (cookieToken || null);

                                if (!token) {
                                    Swal.fire({
                                        icon: 'warning',
                                        title: 'ไม่อนุญาต',
                                        text: 'กรุณาเข้าสู่ระบบก่อนทำการเปลี่ยนสถานะงาน',
                                        confirmButtonText: 'เข้าสู่ระบบ',
                                        showCancelButton: true,
                                        cancelButtonText: 'ยกเลิก'
                                    }).then((result) => {
                                        if (result.isConfirmed) router.push('/login');
                                    });
                                    return;
                                }

                                const newStatus = selectedOption!.value;
                                setStatus(newStatus);
                                onStatusChange(id, newStatus);
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
                                    color: themeStyle.color,
                                    minHeight: "44px", 
                                    cursor: "pointer",
                                    flexWrap: "nowrap"
                                }),
                                menuPortal: (base) => ({ ...base, zIndex: 999999 }),
                                menu: (base) => ({ ...base, zIndex: 999999 }),
                                singleValue: (base) => ({
                                    ...base,
                                    whiteSpace: "normal",
                                    overflowWrap: "break-word",
                                    textAlign: "center",
                                    fontWeight: "bold",
                                    color: themeStyle.color
                                }),
                                dropdownIndicator: (base) => ({ ...base, color: themeStyle.color }),
                                indicatorSeparator: (base) => ({ ...base, display: "none" }),
                                option: (base, state) => {
                                    const optionStatus = state.data.value as keyof typeof selectThemeMap;
                                    const optionTheme = selectThemeMap[optionStatus] || selectThemeMap.following;
                                    return {
                                        ...base,
                                        backgroundColor: state.isFocused ? optionTheme.bg : "var(--button)",
                                        color: optionTheme.color,
                                        fontWeight: "bold",
                                        cursor: "pointer",
                                        ":active": { backgroundColor: optionTheme.bg },
                                    };
                                },
                            }}
                        />
                        </div>

                    <Link href={`/tasks/${id}`} aria-label={`ดูรายละเอียดของงาน ${name} รหัส ${id}`} style={{ width: '100%' }}>
                        <button className={styles.Clickable} tabIndex={-1}> 
                            รายละเอียด 
                        </button>
                    </Link>
                </div>
            </div>
        </div>
    );
}