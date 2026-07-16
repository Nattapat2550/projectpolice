"use client";

import DetailsDisplayer from "@/components/Details/DetailsDisplayer";
import DetailsPanel from "@/components/Details/DetailsPanel";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Swal from "sweetalert2"; // 💡 นำเข้า SweetAlert2
import { Flame } from "lucide-react";

type TaskStatus = "following" | "problem" | "completed";



export default function TaskPage() {
    const { id } = useParams();
    const router = useRouter();
    const [taskData, setTaskData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [logs, setLogs] = useState<any[]>([]);

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";

    const fetchMe = async () => {
        try {
            const token = localStorage.getItem("token") || document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
            if (!token) return;
            const res = await fetch(`${backendUrl}/api/v1/auth/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCurrentUser(data.data);
                return data.data;
            }
        } catch (err) {}
        return null;
    };

    const fetchLogs = async (token: string) => {
        try {
            const res = await fetch(`${backendUrl}/api/v1/tasks/${id}/logs`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLogs(data.data || []);
            }
        } catch (err) {}
    };

    const fetchTask = async () => {
        try {
            const res = await fetch(`${backendUrl}/api/v1/tasks/${id}`);
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();
            if (data.success) {
                setTaskData(data.data);
            }
        } catch (error) {
            console.error("Error fetching task:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) {
            fetchTask();
            fetchMe().then(user => {
                if (user?.role === 'superadmin') {
                    const token = localStorage.getItem("token") || document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
                    if (token) fetchLogs(token);
                }
            });
        }
    }, [id]);

    const getAuthHeaders = () => {
        const token = typeof window !== 'undefined' ? localStorage.getItem("token") || document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] : null;
        const headers: HeadersInit = { "Content-Type": "application/json" };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        return headers;
    };

    const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
        try {
            const res = await fetch(`${backendUrl}/api/v1/tasks/${taskId}/status`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({ status: newStatus }),
            });
            
            if (res.ok) {
                setTaskData((prev: any) => ({ ...prev, status: newStatus }));
                
                // 💡 แสดง Notification แบบ Toast (Popup เล็กๆ มุมขวาบน) เมื่อเปลี่ยนสถานะ
                Swal.fire({
                    icon: 'success',
                    title: 'อัปเดตสถานะสำเร็จ',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000,
                    timerProgressBar: true,
                });
            }
        } catch (error) {
            console.error("Error updating status:", error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถอัปเดตสถานะได้',
            });
        }
    };

    const handleUpdateTask = async () => {
        try {
            const res = await fetch(`${backendUrl}/api/v1/tasks/${id}`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    name: taskData.name,
                    date: taskData.date,
                    notes: taskData.notes,
                    assignments: taskData.assignments,
                    isUrgent: taskData.isUrgent, // ส่งค่าความเร่งด่วนไปยัง Backend
                    main_text: taskData.main_text, // ส่งค่าข้อความเต็มไปยัง Backend
                    task_detail: taskData.task_detail, // ส่งค่ารายละเอียดงานรวมไปยัง Backend
                    urgency_level: taskData.urgency_level,
                    secret_level: taskData.secret_level,
                    meeting_date: taskData.meeting_date,
                    reply_due_date: taskData.reply_due_date
                }),
            });
            const data = await res.json();
            if (data.success) {
                // 💡 เปลี่ยนจาก alert ธรรมดา เป็น Swal
                Swal.fire({
                    icon: 'success',
                    title: 'บันทึกข้อมูลสำเร็จ!',
                    showConfirmButton: false,
                    timer: 1500
                });
                setIsEditing(false);
                fetchTask(); // ดึงข้อมูลล่าสุดมาอัปเดตหน้าจออีกครั้ง
            }
        } catch (error) {
            console.error("Error updating task:", error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถบันทึกข้อมูลได้',
            });
        }
    };

    const handleDeleteTask = async () => {
        // 💡 เปลี่ยนจาก confirm ธรรมดา เป็น Swal เพื่อความสวยงามและป้องกันการกดผิด
        const result = await Swal.fire({
            title: 'คุณแน่ใจหรือไม่?',
            text: "หากลบแล้วจะไม่สามารถกู้คืนงานนี้ได้!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'ใช่, ลบเลย!',
            cancelButtonText: 'ยกเลิก'
        });

        if (!result.isConfirmed) return;

        try {
            const headers: HeadersInit = {};
            const token = typeof window !== 'undefined' ? localStorage.getItem("token") || document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] : null;
            if (token) headers["Authorization"] = `Bearer ${token}`;

            const res = await fetch(`${backendUrl}/api/v1/tasks/${id}`, {
                method: "DELETE",
                headers: headers
            });
            const data = await res.json();
            if (data.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'ลบงานสำเร็จ',
                    showConfirmButton: false,
                    timer: 1500
                }).then(() => {
                    router.push("/"); 
                });
            }
        } catch (error) {
            console.error("Error deleting task:", error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถลบงานได้',
            });
        }
    };

    if (loading) return <div className="p-16 text-center text-xl" style={{color:"var(--header)"}}>กำลังโหลดข้อมูล...</div>;
    if (!taskData) return <div className="p-16 text-center text-xl text-red-500">ไม่พบข้อมูลงาน</div>;

    const handleToggleUrgent = async () => {
        // เช็คค่าปัจจุบันและสลับค่า
        const currentUrgentStatus = taskData.isUrgent || taskData.is_urgent;
        const newUrgentStatus = !currentUrgentStatus;

        try {
            const res = await fetch(`${backendUrl}/api/v1/tasks/${id}`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    name: taskData.name,
                    date: taskData.date,
                    notes: taskData.notes,
                    assignments: taskData.assignments,
                    isUrgent: newUrgentStatus,
                    main_text: taskData.main_text,
                    task_detail: taskData.task_detail,
                    urgency_level: taskData.urgency_level,
                    secret_level: taskData.secret_level,
                    meeting_date: taskData.meeting_date,
                    reply_due_date: taskData.reply_due_date
                }),
            });
            
            if (res.ok) {
                // อัปเดต UI ทันที
                setTaskData((prev: any) => ({ ...prev, isUrgent: newUrgentStatus, is_urgent: newUrgentStatus }));
                
                Swal.fire({
                    icon: 'success',
                    title: newUrgentStatus ? 'ตั้งเป็นงานด่วนแล้ว' : 'ยกเลิกสถานะงานด่วนแล้ว',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000,
                    timerProgressBar: true,
                });
            }
        } catch (error) {
            console.error("Error updating urgent status:", error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถอัปเดตความเร่งด่วนได้' });
        }
    };

    const isUrgent = taskData.isUrgent || taskData.is_urgent;

    return (
        <div className="flex flex-col w-full min-h-screen p-6 md:p-16 pt-8 gap-12 overflow-x-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <h1
                    style={{
                        color: "var(--header)",
                        fontWeight: "bold",
                        fontSize: "2.5rem",
                    }}
                >
                    รายละเอียดการติดตาม
                </h1>
                
                <button
                    onClick={handleToggleUrgent}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all border-2 ${
                        isUrgent
                            ? 'bg-(--redBG) text-(--redText) border-(--redBorder) hover:opacity-80 shadow-md'
                            : 'bg-(--wrapper) text-(--foreground) border-(--shadow) hover:bg-(--shadow) opacity-70 hover:opacity-100'
                    }`}
                >
                    <Flame size={18} className={isUrgent ? 'animate-pulse' : ''} />
                    {isUrgent ? 'สถานะ: งานด่วน' : 'ตั้งเป็นงานด่วน'}
                </button>
            </div>

            
            <div className="flex flex-col xl:flex-row justify-between gap-12 items-stretch">
                <div className="flex flex-1 w-full">
                    <DetailsDisplayer 
                        taskData={taskData} 
                        setTaskData={setTaskData} 
                        isEditing={isEditing} 
                    />
                </div>
                    
                <div className="flex flex-1 w-full">
                    <DetailsPanel 
                        taskData={taskData}
                        setTaskData={setTaskData}
                        isEditing={isEditing}
                        setIsEditing={setIsEditing}
                        onStatusChange={handleStatusChange}
                        onUpdateTask={handleUpdateTask}
                        onDeleteTask={handleDeleteTask}
                    />
                </div>
            </div>
            
            {currentUser?.role === 'superadmin' && (
                <div className="flex flex-col bg-(--container) rounded-xl border border-(--shadow) p-6 mt-6 shadow-sm w-full">
                    <h2 className="text-xl font-bold mb-4" style={{ color: "var(--header)" }}>บันทึกประวัติการเปลี่ยนแปลง (Log)</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-(--shadow)">
                                    <th className="p-3 font-semibold" style={{ color: "var(--header)" }}>เวลา</th>
                                    <th className="p-3 font-semibold" style={{ color: "var(--header)" }}>ผู้ใช้งาน</th>
                                    <th className="p-3 font-semibold" style={{ color: "var(--header)" }}>เหตุการณ์</th>
                                    <th className="p-3 font-semibold" style={{ color: "var(--header)" }}>รายละเอียด</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log: any) => (
                                    <tr key={log.id} className="border-b border-(--shadow) hover:bg-zinc-50 dark:hover:bg-zinc-900/30">
                                        <td className="p-3 text-sm text-(--foreground)">{new Date(log.created_at).toLocaleString('th-TH')}</td>
                                        <td className="p-3">
                                            {log.user_name ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs" style={{ backgroundColor: log.user_color || '#3B82F6' }}>
                                                        {log.user_name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm font-medium text-(--foreground)">{log.user_name}</span>
                                                </div>
                                            ) : (
                                                <span className="text-sm text-zinc-500">ระบบ</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-sm text-(--foreground)">
                                            {log.action === 'created_task' ? 'สร้างงาน' :
                                             log.action === 'updated_status' ? 'อัปเดตสถานะ' :
                                             log.action === 'updated_details' ? 'แก้ไขข้อมูล' :
                                             log.action === 'assigned_user' ? 'มอบหมายงาน' :
                                             log.action === 'deleted_task' ? 'ลบงาน' : log.action}
                                        </td>
                                        <td className="p-3 text-xs text-zinc-500 max-w-xs truncate" title={log.details}>
                                            {log.details || '-'}
                                        </td>
                                    </tr>
                                ))}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-6 text-center text-zinc-500">ไม่มีประวัติการเปลี่ยนแปลง</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}