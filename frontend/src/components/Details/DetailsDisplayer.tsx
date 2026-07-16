"use client"

import styles from "./Details.module.css"
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

const getTextColor = (bgColor: string) => {
    if (!bgColor || !bgColor.startsWith('#')) return '#1f2937'; 
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#1f2937' : '#ffffff';
};

const formatText = (text: string) => {
    if (!text) return "ไม่พบข้อความเนื้อหาในเอกสาร";
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        return part;
    });
};

export default function DetailsDisplayer({ 
    taskData, 
    setTaskData, 
    isEditing 
}: { 
    taskData: any; 
    setTaskData: any; 
    isEditing: boolean; 
}) {
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);
    const [currentUser, setCurrentUser] = useState<any>(null);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003"}/api/v1/users`);
                if (res.ok) {
                    const data = await res.json();
                    setUsers(data.data || []);
                }
            } catch (err) {
                console.error("Fetch users failed", err);
            }
        };

        const fetchMe = async () => {
            try {
                const token = localStorage.getItem("token") || document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
                if (!token) return;
                const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003"}/api/v1/auth/me`, {
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
    }, []);

    const handleAddAssignment = () => {
        setTaskData((prev: any) => {
            const newAssignments = [...(prev.assignments || [])];
            newAssignments.push({
                user_id: "",
                personInCharge: "ไม่ระบุ",
                role_or_name: "เพิ่มด้วยตนเอง"
            });
            return { ...prev, assignments: newAssignments };
        });
    };

    const handleDeleteAssignment = (assignIndex: number) => {
        setTaskData((prev: any) => {
            const newAssignments = [...(prev.assignments || [])];
            newAssignments.splice(assignIndex, 1);
            return { ...prev, assignments: newAssignments };
        });
    };

    const handleUserSelect = (assignIndex: number, userId: string) => {
        setTaskData((prev: any) => {
            const newAssignments = [...(prev.assignments || [])];
            const assign = { ...newAssignments[assignIndex] };
            
            assign.user_id = userId;
            const selectedUser = users.find(u => String(u.id || u._id) === String(userId));
            assign.personInCharge = selectedUser ? selectedUser.name : "ไม่ระบุ";
            
            newAssignments[assignIndex] = assign;
            return { ...prev, assignments: newAssignments };
        });
    };

    return (
        <div className="flex flex-col w-full h-full gap-6 min-h-120">
            <div className={styles.ContentWrapper}>
                <div className={styles.ContentContainer}>
                    <div className={styles.ContentHeaderScrollable}>
                        
                        <div className="mb-6">
                            <h2 className={styles.Header} style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                                รายละเอียดจากเอกสาร (ข้อความเต็ม)
                            </h2>
                            <p className="text-sm text-(--foreground)/60 mb-4 font-medium flex items-center gap-2 bg-(--container) w-fit px-3 py-1.5 rounded-full border border-(--shadow)/60">
                                👤 เพิ่มเข้าระบบโดย: <span className="font-bold text-(--blueText)">{taskData?.creatorName || "ไม่ระบุ"}</span>
                            </p>
                            {taskData?.document_link && (
                                <a 
                                    href={taskData.document_link} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className={styles.Button}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '1rem', textDecoration: 'none' }}
                                >
                                    📄 เปิดดูไฟล์เอกสารต้นฉบับ
                                </a>
                            )}
                            <div className={styles.TextArea} style={{ 
                                padding: '1rem', 
                                whiteSpace: "pre-wrap", 
                                lineHeight: "1.6", 
                                color: 'var(--header)',
                                maxHeight: '350px',
                                overflowY: 'auto',
                                borderRadius: '8px'
                            }}>
                                {isEditing ? (
                                    <textarea
                                        style={{
                                            width: '100%',
                                            minHeight: '200px',
                                            padding: '0.5rem',
                                            backgroundColor: 'var(--button)',
                                            color: 'var(--header)',
                                            border: '2px solid var(--wrapper)',
                                            borderRadius: '6px',
                                            resize: 'vertical',
                                            outline: 'none',
                                            fontFamily: 'inherit',
                                            fontSize: 'inherit'
                                        }}
                                        value={taskData?.main_text || ""}
                                        onChange={(e) => setTaskData((prev: any) => ({ ...prev, main_text: e.target.value }))}
                                        placeholder="เพิ่มหรือแก้ไขข้อความเนื้อหาในเอกสาร..."
                                    />
                                ) : (
                                    taskData?.main_text ? formatText(taskData.main_text) : "ไม่พบข้อความเนื้อหาในเอกสาร"
                                )}
                            </div>
                        </div>

                        <div className="mb-6">
                            <h2 className={styles.Header} style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                                รายละเอียดสิ่งที่ต้องดำเนินการรวม
                            </h2>
                            <div className={styles.TextArea} style={{ 
                                padding: '1rem', 
                                whiteSpace: "pre-wrap", 
                                lineHeight: "1.6", 
                                color: 'var(--header)',
                                maxHeight: '350px',
                                overflowY: 'auto',
                                borderRadius: '8px',
                                backgroundColor: 'var(--yellowBG)',
                                border: '1px solid var(--yellowBorder)'
                            }}>
                                {isEditing ? (
                                    <textarea
                                        style={{
                                            width: '100%',
                                            minHeight: '150px',
                                            padding: '0.5rem',
                                            backgroundColor: 'var(--button)',
                                            color: 'var(--header)',
                                            border: '2px solid var(--wrapper)',
                                            borderRadius: '6px',
                                            resize: 'vertical',
                                            outline: 'none',
                                            fontFamily: 'inherit',
                                            fontSize: 'inherit'
                                        }}
                                        value={taskData?.task_detail || ""}
                                        onChange={(e) => setTaskData((prev: any) => ({ ...prev, task_detail: e.target.value }))}
                                        placeholder="เพิ่มหรือแก้ไขรายละเอียดสิ่งที่ต้องดำเนินการ..."
                                    />
                                ) : (
                                    taskData?.task_detail ? formatText(taskData.task_detail) : "ไม่มีรายละเอียดเฉพาะที่ถูกสรุปไว้"
                                )}
                            </div>
                        </div>

                        <hr className={styles.Line} style={{ marginBottom: '1.5rem', opacity: 0.3 }} />

                        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                            <h2 className={styles.Header} style={{ fontSize: '1.5rem' }}>งานติดตามที่ตรวจอ่านได้</h2>
                            
                            {isEditing && (
                                <button 
                                    onClick={handleAddAssignment}
                                    className={styles.Button}
                                    style={{ fontSize: '1rem', padding: '0.4rem 0.8rem', margin: 0 }}
                                >
                                    + เพิ่มการมอบหมายงาน
                                </button>
                            )}
                        </div>
                        
                        <div className="flex flex-col gap-6">
                            {taskData?.assignments?.length > 0 ? taskData.assignments.map((assign: any, index: number) => {
                                const assignedUser = users.find(u => String(u.id || u._id) === String(assign.user_id));
                                const userColor = assignedUser?.color || '#e5e7eb';
                                const userTextColor = getTextColor(userColor);

                                return (
                                    <div key={index} className={styles.TaskWrapper} style={{ 
                                        padding: '1.25rem', 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        gap: '1rem',
                                        backgroundColor: 'var(--button)',
                                        borderColor: 'var(--wrapper)'
                                    }}>
                                        
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                                <label className="font-bold text-lg" style={{ color: 'var(--header)' }}>สำหรับ (ผู้รับผิดชอบ):</label>
                                                {isEditing ? (
                                                    <select 
                                                        className={styles.CustomSelect}
                                                        style={{ padding: '0.4rem 0.8rem', width: 'auto' }}
                                                        value={assign.user_id || ""}
                                                        onChange={(e) => handleUserSelect(index, e.target.value)}
                                                    >
                                                        <option value="">-- เลือกระบุบุคคล --</option>
                                                        {users
                                                            .filter(u => currentUser?.role !== 'admin' || (u.id || u._id) === currentUser?.id)
                                                            .map(u => (
                                                            <option key={u.id || u._id} value={u.id || u._id}>
                                                                {u.name} {u.role ? `(${u.role})` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span 
                                                        className="px-3 py-1 rounded-md text-sm sm:text-base font-bold shadow-sm border border-black/10" 
                                                        style={{ backgroundColor: userColor, color: userTextColor }}
                                                    >
                                                        {assign.personInCharge || "ไม่ระบุ"}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {isEditing && (
                                                <button 
                                                    onClick={() => handleDeleteAssignment(index)}
                                                    className={`${styles.Clickable} ${styles.Red}`}
                                                    style={{ minHeight: '2rem', padding: '0.4rem 0.8rem', width: 'auto', fontSize: '0.9rem' }}
                                                >
                                                    ลบมอบหมายงานนี้
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            }) : (
                                <p style={{ color: "var(--header)" }}>ไม่มีข้อมูลการมอบหมายงาน</p>
                            )}
                        </div>
                        
                    </div>
                </div>
            </div>
        </div>
    );
}