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
                role_or_name: "เพิ่มด้วยตนเอง",
                topics: []
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

    const handleAddTopic = (assignIndex: number) => {
        setTaskData((prev: any) => {
            const newAssignments = [...(prev.assignments || [])];
            const assign = { ...newAssignments[assignIndex] };
            assign.topics = [...(assign.topics || []), { detail: "", is_completed: false }];
            newAssignments[assignIndex] = assign;
            return { ...prev, assignments: newAssignments };
        });
    };

    const handleDeleteTopic = (assignIndex: number, topicIndex: number) => {
        setTaskData((prev: any) => {
            const newAssignments = [...(prev.assignments || [])];
            const assign = { ...newAssignments[assignIndex] };
            assign.topics = (assign.topics || []).filter((_: any, idx: number) => idx !== topicIndex);
            newAssignments[assignIndex] = assign;
            return { ...prev, assignments: newAssignments };
        });
    };

    const handleTopicChange = (assignIndex: number, topicIndex: number, textValue: string) => {
        setTaskData((prev: any) => {
            const newAssignments = [...(prev.assignments || [])];
            const assign = { ...newAssignments[assignIndex] };
            const newTopics = [...(assign.topics || [])];
            newTopics[topicIndex] = { ...newTopics[topicIndex], detail: textValue };
            assign.topics = newTopics;
            newAssignments[assignIndex] = assign;
            return { ...prev, assignments: newAssignments };
        });
    };

    const handleToggleComplete = async (assignIndex: number, topicIndex: number) => {
        // 💡 ตรวจสอบ Token อย่างละเอียด
        const localToken = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
        const cookieToken = document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
        const token = (localToken && localToken !== "undefined") ? localToken : (cookieToken || null);

        if (!token) {
            Swal.fire({
                icon: 'warning',
                title: 'กรุณาเข้าสู่ระบบ',
                text: 'คุณต้องเข้าสู่ระบบก่อนจึงจะอัปเดตสถานะงานนี้ได้',
                showCancelButton: true,
                confirmButtonText: 'ไปหน้าเข้าสู่ระบบ',
                cancelButtonText: 'ยกเลิก'
            }).then((result) => {
                if (result.isConfirmed) router.push('/login');
            });
            return;
        }

        let newAssignmentsData: any = null;

        setTaskData((prev: any) => {
            const newAssignments = [...(prev.assignments || [])];
            const assign = { ...newAssignments[assignIndex] };
            const newTopics = [...(assign.topics || [])];
            
            const currentStatus = newTopics[topicIndex].is_completed || false;
            newTopics[topicIndex] = { ...newTopics[topicIndex], is_completed: !currentStatus };
            
            assign.topics = newTopics;
            newAssignments[assignIndex] = assign;
            newAssignmentsData = newAssignments;
            return { ...prev, assignments: newAssignments };
        });

        if (!isEditing && (taskData.id || taskData._id) && newAssignmentsData) {
            try {
                const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
                await fetch(`${backendUrl}/api/v1/tasks/${taskData.id || taskData._id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        name: taskData.name, 
                        date: taskData.date, 
                        notes: taskData.notes,
                        assignments: newAssignmentsData 
                    }),
                });
            } catch (error) {
                console.error("Error auto-saving task completion:", error);
            }
        }
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
                                const isAssignCompleted = assign.topics?.length > 0 && assign.topics.every((t: any) => t.is_completed);
                                
                                const assignedUser = users.find(u => String(u.id || u._id) === String(assign.user_id));
                                const userColor = assignedUser?.color || '#e5e7eb';
                                const userTextColor = getTextColor(userColor);

                                return (
                                    <div key={index} className={styles.TaskWrapper} style={{ 
                                        padding: '1.25rem', 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        gap: '1rem',
                                        backgroundColor: isAssignCompleted ? 'var(--greenBG)' : 'var(--button)',
                                        borderColor: isAssignCompleted ? 'var(--greenBorder)' : 'var(--wrapper)'
                                    }}>
                                        
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3" style={{ borderBottom: '1px solid var(--wrapper)' }}>
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                                <label className="font-bold text-lg" style={{ color: isAssignCompleted ? 'var(--greenText)' : 'var(--header)' }}>สำหรับ (ผู้รับผิดชอบ):</label>
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

                                        <div className="flex flex-col gap-3">
                                            <div className="flex flex-row items-center justify-between gap-2">
                                                <div className="flex flex-row items-center gap-2">
                                                    <h3 className="font-bold" style={{ color: isAssignCompleted ? 'var(--greenText)' : 'var(--header)' }}>สิ่งที่ต้องดำเนินการ:</h3>
                                                    {isAssignCompleted && (
                                                        <span className={`${styles.Green}`} style={{ padding: '0.2rem 0.5rem', borderRadius: '0.3rem', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                            ✅ เสร็จสิ้นแล้ว
                                                        </span>
                                                    )}
                                                </div>
                                                {isEditing && (
                                                    <button 
                                                        className={styles.Button}
                                                        style={{ fontSize: '0.9rem', padding: '0.3rem 0.6rem', margin: 0 }}
                                                        onClick={() => handleAddTopic(index)}
                                                    >
                                                        + เพิ่มหัวข้อย่อย
                                                    </button>
                                                )}
                                            </div>

                                            <ul className="list-none ml-0 flex flex-col gap-3" style={{ color: isAssignCompleted ? 'var(--greenText)' : 'var(--header)' }}>
                                                {assign.topics?.length > 0 ? assign.topics.map((topic: any, i: number) => (
                                                    <li key={i} className="text-sm flex items-start sm:items-center gap-2">
                                                        
                                                        <input 
                                                            type="checkbox"
                                                            style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer', flexShrink: 0, marginTop: '0.2rem' }}
                                                            checked={topic.is_completed || false}
                                                            onChange={() => handleToggleComplete(index, i)}
                                                        />

                                                        {isEditing ? (
                                                            <div className="flex w-full gap-2 items-center">
                                                                <input 
                                                                    type="text" 
                                                                    className={styles.CustomSelect}
                                                                    style={{ padding: '0.4rem 0.8rem' }}
                                                                    value={topic.detail || ""}
                                                                    onChange={(e) => handleTopicChange(index, i, e.target.value)}
                                                                    placeholder="รายละเอียดงาน..."
                                                                />
                                                                <button 
                                                                    className={`${styles.Clickable} ${styles.Red}`}
                                                                    style={{ minHeight: '2rem', padding: '0.4rem 0.8rem', width: 'auto', flexShrink: 0 }}
                                                                    onClick={() => handleDeleteTopic(index, i)}
                                                                    title="ลบหัวข้อนี้"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className={`flex-1 text-base leading-relaxed ${topic.is_completed ? "opacity-60" : ""}`} style={{ textDecoration: topic.is_completed ? 'line-through' : 'none' }}>
                                                                {topic.detail || "ไม่มีรายละเอียดเฉพาะ"}
                                                            </span>
                                                        )}
                                                    </li>
                                                )) : <li className="text-sm" style={{ color: 'var(--greyText)' }}>- ไม่มีรายละเอียดเฉพาะ -</li>}
                                            </ul>
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