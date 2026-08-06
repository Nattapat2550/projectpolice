"use client"

import styles from "./Details.module.css"
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { getValidExternalUrl } from "@/components/firstpage/TaskTable";

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
    const parts = text.split(/(\*\*[\s\S]*?\*\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
            return <strong key={index} className="font-bold text-[1rem] block my-1" style={{ color: "var(--header)" }}>{part.slice(2, -2)}</strong>;
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

    const handleToggleCheckbox = async () => {
        if (!currentUser) return;
        const isSuperAdmin = currentUser.role === 'admin' || currentUser.role === 'superadmin';
        const isOwner = String(taskData?.created_by) === String(currentUser.id) || String(taskData?.created_by) === String(currentUser._id);
        
        if (!isSuperAdmin && !isOwner) {
            Swal.fire({ icon: 'error', title: 'ไม่ได้รับอนุญาต', text: 'เฉพาะผู้ดูแลระบบหรือคนรับผิดชอบงานนี้เท่านั้นที่สามารถติ๊กงานได้' });
            return;
        }

        let currentDetail = taskData?.task_detail || "";
        let newDetail = currentDetail;
        
        let isCurrentlyChecked = false;
        if (currentDetail.startsWith('[x] ') || currentDetail.startsWith('[X] ')) {
            isCurrentlyChecked = true;
            currentDetail = currentDetail.substring(4);
        } else if (currentDetail.startsWith('[ ] ')) {
            currentDetail = currentDetail.substring(4);
        }

        if (isCurrentlyChecked) {
            newDetail = '[ ] ' + currentDetail;
        } else {
            newDetail = '[x] ' + currentDetail;
        }
        
        setTaskData((prev: any) => ({ ...prev, task_detail: newDetail }));

        try {
            const token = localStorage.getItem("token") || document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003"}/api/v1/tasks/${taskData.id}`, {
                method: "PUT",
                headers: { 
                    "Content-Type": "application/json",
                    ...(token ? { "Authorization": `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ ...taskData, task_detail: newDetail })
            });
            if (!res.ok) throw new Error("Failed to update");
        } catch (err) {
            console.error(err);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกการเปลี่ยนแปลงได้' });
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
                            {getValidExternalUrl(taskData?.document_link) && (
                                <a 
                                    href={getValidExternalUrl(taskData.document_link)!} 
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
                                    taskData?.task_detail ? (
                                        <div 
                                            className="flex items-start gap-3 cursor-pointer select-none p-1 rounded-md hover:bg-(--button)/40 transition-colors"
                                            onClick={handleToggleCheckbox}
                                        >
                                            <input 
                                                type="checkbox" 
                                                className="mt-1.5 w-5 h-5 cursor-pointer shrink-0 pointer-events-none"
                                                checked={taskData.task_detail.startsWith('[x] ') || taskData.task_detail.startsWith('[X] ')}
                                                readOnly
                                                style={{ accentColor: "var(--greenBG)" }}
                                            />
                                            <div 
                                                className={(taskData.task_detail.startsWith('[x] ') || taskData.task_detail.startsWith('[X] ')) ? "line-through opacity-70 cursor-pointer" : "cursor-pointer"} 
                                                style={{ wordBreak: 'break-word', width: '100%' }}
                                            >
                                                {formatText(
                                                    taskData.task_detail.startsWith('[x] ') || taskData.task_detail.startsWith('[X] ') || taskData.task_detail.startsWith('[ ] ') 
                                                    ? taskData.task_detail.substring(4) 
                                                    : taskData.task_detail
                                                )}
                                            </div>
                                        </div>
                                    ) : "ไม่มีรายละเอียดเฉพาะที่ถูกสรุปไว้"
                                )}
                            </div>
                        </div>

                        <hr className={styles.Line} style={{ marginBottom: '1.5rem', opacity: 0.3 }} />
                    </div>
                </div>
            </div>
        </div>
    );
}