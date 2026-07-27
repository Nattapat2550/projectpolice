"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
    ArrowLeft,
    Calendar,
    CheckCircle2,
    ChevronDown,
    Clock,
    FileText,
    Flame,
    Hash,
    History,
    Link as LinkIcon,
    Loader2,
    Lock,
    Pencil,
    Plus,
    Save,
    ShieldAlert,
    Trash2,
    User,
    Users,
    X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TaskStatus = "following" | "problem" | "completed";
type UrgencyLevel = "ปกติ" | "ด่วน" | "ด่วนมาก" | "ด่วนที่สุด";
type SecretLevel = "ปกติ" | "ลับ" | "ลับมาก" | "ลับที่สุด";

interface Assignment {
    assignment_id?: string;
    user_id: string | null;
    role_or_name: string;
    personInCharge?: string;
}

interface UserOption {
    id: string;
    name: string;
    color: string;
    role: string;
}

interface LogEntry {
    id: string;
    created_at: string;
    user_name?: string;
    user_color?: string;
    action: string;
    details?: string;
}

interface TaskData {
    id: string;
    name: string;
    status: TaskStatus;
    isUrgent?: boolean;
    is_urgent?: boolean;
    date?: string;
    main_text?: string | null;
    task_detail?: string | null;
    notes?: string | null;
    memo_no?: string | null;
    memo_date?: string | null;
    urgency_level?: UrgencyLevel;
    secret_level?: SecretLevel;
    receive_no?: number | null;
    createdAt?: string;
    sign_date?: string | null;
    meeting_date?: string | null;
    reply_due_date?: string | null;
    created_by?: string;
    creatorName?: string;
    document_link?: string | null;
    assignments: Assignment[];
    personInCharge?: string;
}

/* ------------------------------------------------------------------ */
/*  Static config                                                      */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<
    TaskStatus,
    { label: string; text: string; bg: string; border: string }
> = {
    following: {
        label: "กำลังติดตาม",
        text: "var(--yellowText)",
        bg: "var(--yellowBG)",
        border: "var(--yellowBorder)",
    },
    problem: {
        label: "ติดปัญหา",
        text: "var(--redText)",
        bg: "var(--redBG)",
        border: "var(--redBorder)",
    },
    completed: {
        label: "เสร็จสิ้น",
        text: "var(--greenText)",
        bg: "var(--greenBG)",
        border: "var(--greenBorder)",
    },
};

const URGENCY_LEVELS: UrgencyLevel[] = ["ปกติ", "ด่วน", "ด่วนมาก", "ด่วนที่สุด"];
const SECRET_LEVELS: SecretLevel[] = ["ปกติ", "ลับ", "ลับมาก", "ลับที่สุด"];

function urgencyStyle(level?: string) {
    switch (level) {
        case "ด่วนที่สุด":
            return { text: "var(--redText)", bg: "var(--redBG)", border: "var(--redBorder)" };
        case "ด่วนมาก":
            return { text: "var(--orangeText)", bg: "var(--orangeBG)", border: "var(--orangeBorder)" };
        case "ด่วน":
            return { text: "var(--yellowText)", bg: "var(--yellowBG)", border: "var(--yellowBorder)" };
        default:
            return { text: "var(--foreground)", bg: "var(--wrapper)", border: "var(--shadow)" };
    }
}

function secretStyle(level?: string) {
    switch (level) {
        case "ลับที่สุด":
            return { text: "var(--redText)", bg: "var(--redBG)", border: "var(--redBorder)" };
        case "ลับมาก":
            return { text: "var(--orangeText)", bg: "var(--orangeBG)", border: "var(--orangeBorder)" };
        case "ลับ":
            return { text: "var(--yellowText)", bg: "var(--yellowBG)", border: "var(--yellowBorder)" };
        default:
            return { text: "var(--foreground)", bg: "var(--wrapper)", border: "var(--shadow)" };
    }
}

const AVATAR_COLORS = [
    "#900707", "#903207", "#872d00", "#008755", "#1447e6", "#5f5f5f",
];

function avatarColorFor(seed: string) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatThaiDate(value?: string | null, withTime = false) {
    if (!value) return "-";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "-";
    try {
        return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
            day: "numeric",
            month: "long",
            year: "numeric",
            ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
        }).format(d);
    } catch {
        return d.toLocaleDateString("th-TH");
    }
}

function toDateInputValue(value?: string | null) {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
}

function toDateTimeInputValue(value?: string | null) {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
}

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

function SectionCard({
    title,
    icon,
    children,
    className = "",
}: {
    title?: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`rounded-2xl border p-5 sm:p-6 shadow-sm bg-(--container) border-(--shadow) ${className}`}
        >
            {title && (
                <div className="flex items-center gap-2 mb-4">
                    {icon}
                    <h2 className="font-bold text-lg" style={{ color: "var(--header)" }}>
                        {title}
                    </h2>
                </div>
            )}
            {children}
        </div>
    );
}

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wide opacity-60">
                {label}
            </span>
            {children}
        </div>
    );
}

function ReadValue({ children }: { children: React.ReactNode }) {
    return <div className="text-[1.05rem] break-words">{children}</div>;
}

const inputClass =
    "w-full rounded-lg border border-(--shadow) bg-(--button) px-3 py-2.5 text-base outline-none transition focus:border-(--header) focus:ring-2 focus:ring-(--header)/20";

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function TaskDetailPage() {
    const { id } = useParams();
    const router = useRouter();

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";

    const [taskData, setTaskData] = useState<TaskData | null>(null);
    const [draft, setDraft] = useState<TaskData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [showLogs, setShowLogs] = useState(false);
    const titleRef = useRef<HTMLTextAreaElement>(null);
    const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

    useIsoLayoutEffect(() => {
        if (!titleRef.current) return;
        titleRef.current.style.height = "auto";
        titleRef.current.style.height = `${titleRef.current.scrollHeight}px`;
    }, [isEditing, draft?.name]);

    const getToken = () =>
        typeof window !== "undefined"
            ? localStorage.getItem("token") ||
              document.cookie.split("; ").find((row) => row.startsWith("token="))?.split("=")[1]
            : null;

    const getAuthHeaders = (): HeadersInit => {
        const token = getToken();
        const headers: HeadersInit = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        return headers;
    };

    const fetchTask = useCallback(async () => {
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
    }, [backendUrl, id]);

    const fetchMe = useCallback(async () => {
        try {
            const token = getToken();
            if (!token) return null;
            const res = await fetch(`${backendUrl}/api/v1/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setCurrentUser(data.data);
                return data.data;
            }
        } catch {
            /* ignore */
        }
        return null;
    }, [backendUrl]);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch(`${backendUrl}/api/v1/users`);
            if (res.ok) {
                const data = await res.json();
                setUsers(data.data || data.users || []);
            }
        } catch {
            /* ignore */
        }
    }, [backendUrl]);

    const fetchLogs = useCallback(
        async (token: string) => {
            try {
                const res = await fetch(`${backendUrl}/api/v1/tasks/${id}/logs`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setLogs(data.data || []);
                }
            } catch {
                /* ignore */
            }
        },
        [backendUrl, id]
    );

    useEffect(() => {
        if (!id) return;
        fetchTask();
        fetchUsers();
        fetchMe().then((user) => {
            if (user?.role === "superadmin") {
                const token = getToken();
                if (token) fetchLogs(token);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    /* -------------------------- actions -------------------------- */

    const startEditing = () => {
        if (!taskData) return;
        setDraft(JSON.parse(JSON.stringify(taskData)));
        setIsEditing(true);
    };

    const cancelEditing = () => {
        setDraft(null);
        setIsEditing(false);
    };

    const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
        try {
            const res = await fetch(`${backendUrl}/api/v1/tasks/${taskId}/status`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                setTaskData((prev) => (prev ? { ...prev, status: newStatus } : prev));
                Swal.fire({
                    icon: "success",
                    title: "อัปเดตสถานะสำเร็จ",
                    toast: true,
                    position: "top-end",
                    showConfirmButton: false,
                    timer: 2500,
                    timerProgressBar: true,
                });
            }
        } catch (error) {
            console.error("Error updating status:", error);
            Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: "ไม่สามารถอัปเดตสถานะได้" });
        }
    };

    const handleToggleUrgent = async () => {
        if (!taskData) return;
        const current = taskData.isUrgent ?? taskData.is_urgent ?? false;
        const next = !current;
        try {
            const res = await fetch(`${backendUrl}/api/v1/tasks/${id}`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify(buildUpdateBody({ ...taskData, isUrgent: next })),
            });
            if (res.ok) {
                setTaskData((prev) =>
                    prev ? { ...prev, isUrgent: next, is_urgent: next } : prev
                );
                Swal.fire({
                    icon: "success",
                    title: next ? "ตั้งเป็นงานด่วนแล้ว" : "ยกเลิกสถานะงานด่วนแล้ว",
                    toast: true,
                    position: "top-end",
                    showConfirmButton: false,
                    timer: 2500,
                    timerProgressBar: true,
                });
            }
        } catch (error) {
            console.error("Error updating urgent status:", error);
            Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: "ไม่สามารถอัปเดตความเร่งด่วนได้" });
        }
    };

    function buildUpdateBody(source: TaskData) {
        return {
            name: source.name,
            date: source.date,
            notes: source.notes,
            assignments: source.assignments,
            isUrgent: source.isUrgent ?? source.is_urgent,
            main_text: source.main_text,
            task_detail: source.task_detail,
            urgency_level: source.urgency_level,
            secret_level: source.secret_level,
            meeting_date: source.meeting_date,
            reply_due_date: source.reply_due_date,
            receive_no: source.receive_no,
            receive_date: source.date,
            sign_date: source.sign_date,
        };
    }

    const handleSave = async () => {
        if (!draft) return;
        setSaving(true);
        try {
            const res = await fetch(`${backendUrl}/api/v1/tasks/${id}`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify(buildUpdateBody(draft)),
            });
            const data = await res.json();
            if (data.success) {
                Swal.fire({ icon: "success", title: "บันทึกข้อมูลสำเร็จ!", showConfirmButton: false, timer: 1500 });
                setIsEditing(false);
                setDraft(null);
                fetchTask();
            } else {
                throw new Error(data.message || "save failed");
            }
        } catch (error) {
            console.error("Error updating task:", error);
            Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: "ไม่สามารถบันทึกข้อมูลได้" });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        const result = await Swal.fire({
            title: "คุณแน่ใจหรือไม่?",
            text: "หากลบแล้วจะไม่สามารถกู้คืนงานนี้ได้!",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: "ใช่, ลบเลย!",
            cancelButtonText: "ยกเลิก",
        });
        if (!result.isConfirmed) return;

        try {
            const res = await fetch(`${backendUrl}/api/v1/tasks/${id}`, {
                method: "DELETE",
                headers: getAuthHeaders(),
            });
            const data = await res.json();
            if (data.success) {
                Swal.fire({ icon: "success", title: "ลบงานสำเร็จ", showConfirmButton: false, timer: 1500 }).then(() => {
                    router.push("/");
                });
            }
        } catch (error) {
            console.error("Error deleting task:", error);
            Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: "ไม่สามารถลบงานได้" });
        }
    };

    const updateDraft = (patch: Partial<TaskData>) => {
        setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    };

    const addAssignment = () => {
        if (!draft) return;
        updateDraft({
            assignments: [...draft.assignments, { user_id: null, role_or_name: "" }],
        });
    };

    const removeAssignment = (index: number) => {
        if (!draft) return;
        const next = [...draft.assignments];
        next.splice(index, 1);
        updateDraft({ assignments: next });
    };

    const updateAssignment = (index: number, patch: Partial<Assignment>) => {
        if (!draft) return;
        const next = [...draft.assignments];
        next[index] = { ...next[index], ...patch };
        updateDraft({ assignments: next });
    };

    /* -------------------------- loading / empty states -------------------------- */

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3">
                <Loader2 className="animate-spin" size={36} style={{ color: "var(--header)" }} />
                <p className="text-lg opacity-70">กำลังโหลดข้อมูล...</p>
            </div>
        );
    }

    if (!taskData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4 px-6 text-center">
                <ShieldAlert size={40} style={{ color: "var(--redText)" }} />
                <p className="text-xl font-semibold">ไม่พบข้อมูลงานนี้</p>
                <button
                    onClick={() => router.push("/")}
                    className="rounded-full px-5 py-2.5 font-medium bg-(--wrapper) hover:bg-(--shadow) transition"
                >
                    กลับหน้าหลัก
                </button>
            </div>
        );
    }

    const view = isEditing && draft ? draft : taskData;
    const isUrgent = view.isUrgent ?? view.is_urgent ?? false;
    const statusMeta = STATUS_CONFIG[view.status] ?? STATUS_CONFIG.following;
    const urgencyMeta = urgencyStyle(view.urgency_level);
    const secretMeta = secretStyle(view.secret_level);

    // role-based permissions: user = view only, admin = edit, superadmin = edit + delete
    const canEdit = currentUser?.role === "admin" || currentUser?.role === "superadmin";
    const canDelete = currentUser?.role === "superadmin";

    return (
        <div className="flex flex-col w-full min-h-screen px-4 py-6 sm:px-6 md:px-10 md:py-10 lg:px-16 lg:py-12 gap-4 lg:gap-6 overflow-x-hidden bg-(--wrapper)">
            {/* ---------- Top bar ---------- */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium bg-(--wrapper) hover:bg-(--shadow) transition"
                    >
                        <ArrowLeft size={16} />
                        <span className="hidden sm:inline">ย้อนกลับ</span>
                    </button>

                  </div>

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="flex flex-col gap-2 min-w-0">
                        <span className="text-xs font-semibold uppercase tracking-wide opacity-50">
                            รายละเอียดการติดตาม
                        </span>
                        {isEditing && draft ? (
                            <textarea
                                ref={titleRef}
                                value={draft.name || ""}
                                onChange={(e) => updateDraft({ name: e.target.value })}
                                rows={1}
                                className={`${inputClass} text-2xl sm:text-3xl font-bold resize-none overflow-hidden leading-snug min-h-[1lh] [field-sizing:content]`}
                                style={{ color: "var(--header)" }}
                            />
                        ) : (
                            <h1
                                className="text-2xl sm:text-3xl md:text-4xl font-bold break-words leading-tight"
                                style={{ color: "var(--header)" }}
                            >
                                {taskData.name}
                            </h1>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                            {taskData.memo_no && (
                                <span className="inline-flex items-center gap-1 text-sm font-medium rounded-full px-3 py-1 bg-(--wrapper)">
                                    <Hash size={13} /> {taskData.memo_no}
                                </span>
                            )}
                            <span
                                className="inline-flex items-center gap-1 text-sm font-semibold rounded-full px-3 py-1 border"
                                style={{ color: statusMeta.text, backgroundColor: statusMeta.bg, borderColor: statusMeta.border }}
                            >
                                {statusMeta.label}
                            </span>
                        </div>
                    </div>

                    {/* Edit / Save controls */}
                    <div className="flex items-center gap-2 shrink-0">
                        {!isEditing ? (
                            <>
                                {canEdit && (
                                    <button
                                        onClick={startEditing}
                                        className="flex items-center gap-1.5 rounded-full px-4 py-2.5 font-medium text-sm text-(--button) transition hover:opacity-90"
                                        style={{ backgroundColor: "var(--header)" }}
                                    >
                                        <Pencil size={15} /> แก้ไข
                                    </button>
                                )}
                                {canDelete && (
                                    <button
                                        onClick={handleDelete}
                                        className="flex items-center gap-1.5 rounded-full px-4 py-2.5 font-medium text-sm border-2 transition hover:opacity-80 bg-(--redBG) text-(--redText) border-(--redBorder)"
                                    >
                                        <Trash2 size={15} />
                                        <span className="hidden sm:inline">ลบ</span>
                                    </button>
                                )}
                                {!canEdit && (
                                    <span className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-medium bg-(--wrapper) opacity-60">
                                        โหมดดูอย่างเดียว
                                    </span>
                                )}
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={cancelEditing}
                                    disabled={saving}
                                    className="flex items-center gap-1.5 rounded-full px-4 py-2.5 font-medium text-sm bg-(--wrapper) hover:bg-(--shadow) transition disabled:opacity-50"
                                >
                                    <X size={15} /> ยกเลิก
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex items-center gap-1.5 rounded-full px-4 py-2.5 font-medium text-sm text-white transition hover:opacity-90 disabled:opacity-60 bg-(--greenBorder)"
                                >
                                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                                    บันทึก
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ---------- Status stepper ---------- */}
            <SectionCard>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <span className="text-sm font-semibold opacity-60 shrink-0">สถานะงาน</span>
                    
                    <div className="flex flex-wrap gap-2">
                          <button
                        onClick={handleToggleUrgent}
                        disabled={isEditing || !canEdit}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all border-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                            isUrgent
                                ? "bg-(--redBG) text-(--redText) border-(--redBorder) hover:opacity-80 shadow-md"
                                : " text-(--foreground) border-(--shadow) hover:bg-(--shadow) opacity-70 hover:opacity-100"
                        }`}
                    >
                        <Flame size={16} className={isUrgent ? "animate-pulse" : ""} />
                        <span className="">{isUrgent ? "งานด่วน" : "ตั้งเป็นงานด่วน"}</span>
                        </button>
            
                        {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((s) => {
                            const meta = STATUS_CONFIG[s];
                            const active = taskData.status === s;
                            return (
                                <button
                                    key={s}
                                    onClick={() => handleStatusChange(taskData.id, s)}
                                    disabled={isEditing}
                                    className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold border-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={
                                        active
                                            ? { color: meta.text, backgroundColor: meta.bg, borderColor: meta.border }
                                            : { color: "var(--foreground)", backgroundColor: "transparent", borderColor: "var(--shadow)" }
                                    }
                                >
                                    {active && <CheckCircle2 size={14} />}
                                    {meta.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                
            </SectionCard>

            {/* ---------- Main grid ---------- */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 lg:gap-8 items-start">
                {/* ===== Left column ===== */}
                <div className="flex flex-col gap-6 min-w-0">
                    <SectionCard title="ข้อมูลบันทึก / หนังสือ" icon={<FileText size={19} style={{ color: "var(--header)" }} />}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                            <Field label="เลขที่หนังสือ">
                                {isEditing && draft ? (
                                    <ReadValue>{draft.memo_no || "-"}</ReadValue>
                                ) : (
                                    <ReadValue>{taskData.memo_no || "-"}</ReadValue>
                                )}
                            </Field>
                            <Field label="วันที่หนังสือ">
                                <ReadValue>{formatThaiDate(taskData.memo_date)}</ReadValue>
                            </Field>
                            <Field label="เลขรับที่">
                                {isEditing && draft ? (
                                    <input
                                        type="number"
                                        value={draft.receive_no ?? ""}
                                        onChange={(e) => updateDraft({ receive_no: e.target.value ? Number(e.target.value) : null })}
                                        className={inputClass}
                                    />
                                ) : (
                                    <ReadValue>
                                        <span className="inline-flex items-center gap-1">
                                            <Hash size={14} className="opacity-50" />
                                            {taskData.receive_no ?? "-"}
                                        </span>
                                    </ReadValue>
                                )}
                            </Field>
                            <Field label="วันที่ลงนาม">
                                {isEditing && draft ? (
                                    <input
                                        type="date"
                                        value={toDateInputValue(draft.sign_date)}
                                        onChange={(e) => updateDraft({ sign_date: e.target.value })}
                                        className={inputClass}
                                    />
                                ) : (
                                    <ReadValue>{formatThaiDate(taskData.sign_date)}</ReadValue>
                                )}
                            </Field>
                            <Field label="ระดับความเร่งด่วน">
                                {isEditing && draft ? (
                                    <select
                                        value={draft.urgency_level}
                                        onChange={(e) => updateDraft({ urgency_level: e.target.value as UrgencyLevel })}
                                        className={inputClass}
                                    >
                                        {URGENCY_LEVELS.map((lv) => (
                                            <option key={lv} value={lv}>
                                                {lv}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <span
                                        className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold border"
                                        style={{ color: urgencyMeta.text, backgroundColor: urgencyMeta.bg, borderColor: urgencyMeta.border }}
                                    >
                                        <ShieldAlert size={13} />
                                        {taskData.urgency_level || "ปกติ"}
                                    </span>
                                )}
                            </Field>
                            <Field label="ชั้นความลับ">
                                {isEditing && draft ? (
                                    <select
                                        value={draft.secret_level}
                                        onChange={(e) => updateDraft({ secret_level: e.target.value as SecretLevel })}
                                        className={inputClass}
                                    >
                                        {SECRET_LEVELS.map((lv) => (
                                            <option key={lv} value={lv}>
                                                {lv}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <span
                                        className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold border"
                                        style={{ color: secretMeta.text, backgroundColor: secretMeta.bg, borderColor: secretMeta.border }}
                                    >
                                        <Lock size={13} />
                                        {taskData.secret_level || "ปกติ"}
                                    </span>
                                )}
                            </Field>
                        </div>

                        {taskData.document_link && (
                            <a
                                href={taskData.document_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-(--wrapper) hover:bg-(--shadow) transition w-fit"
                            >
                                <LinkIcon size={15} />
                                เปิดเอกสารต้นฉบับ
                            </a>
                        )}
                    </SectionCard>

                    <SectionCard title="เนื้อหาเรื่อง" icon={<FileText size={19} style={{ color: "var(--header)" }} />}>
                        {isEditing && draft ? (
                            <textarea
                                value={draft.main_text || ""}
                                onChange={(e) => updateDraft({ main_text: e.target.value })}
                                rows={5}
                                className={`${inputClass} resize-y leading-relaxed`}
                            />
                        ) : (
                            <p className="whitespace-pre-wrap leading-relaxed">{taskData.main_text || "-"}</p>
                        )}
                    </SectionCard>

                    <SectionCard title="รายละเอียดการมอบหมายงาน" icon={<FileText size={19} style={{ color: "var(--header)" }} />}>
                        {isEditing && draft ? (
                            <textarea
                                value={draft.task_detail || ""}
                                onChange={(e) => updateDraft({ task_detail: e.target.value })}
                                rows={5}
                                className={`${inputClass} resize-y leading-relaxed`}
                            />
                        ) : (
                            <p className="whitespace-pre-wrap leading-relaxed">{taskData.task_detail || "-"}</p>
                        )}
                    </SectionCard>

                    <SectionCard title="หมายเหตุ">
                        {isEditing && draft ? (
                            <textarea
                                value={draft.notes || ""}
                                onChange={(e) => updateDraft({ notes: e.target.value })}
                                rows={3}
                                className={`${inputClass} resize-y leading-relaxed`}
                            />
                        ) : (
                            <p className="whitespace-pre-wrap leading-relaxed opacity-90">{taskData.notes || "ไม่มีหมายเหตุ"}</p>
                        )}
                    </SectionCard>
                </div>

                {/* ===== Right sidebar ===== */}
                <div className="flex flex-col gap-6 min-w-0">
                    <SectionCard title="กำหนดการสำคัญ" icon={<Calendar size={19} style={{ color: "var(--header)" }} />}>
                        <div className="flex flex-col gap-4">
                            <Field label="วันที่ประชุม">
                                {isEditing && draft ? (
                                    <input
                                        type="datetime-local"
                                        value={toDateTimeInputValue(draft.meeting_date)}
                                        onChange={(e) => updateDraft({ meeting_date: e.target.value })}
                                        className={inputClass}
                                    />
                                ) : (
                                    <ReadValue>{formatThaiDate(taskData.meeting_date, true)}</ReadValue>
                                )}
                            </Field>
                            <Field label="กำหนดตอบกลับ">
                                {isEditing && draft ? (
                                    <input
                                        type="datetime-local"
                                        value={toDateTimeInputValue(draft.reply_due_date)}
                                        onChange={(e) => updateDraft({ reply_due_date: e.target.value })}
                                        className={inputClass}
                                    />
                                ) : (
                                    <ReadValue>{formatThaiDate(taskData.reply_due_date, true)}</ReadValue>
                                )}
                            </Field>
                            <div className="h-px bg-(--shadow) opacity-50" />
                            <Field label="สร้างเมื่อ">
                                <ReadValue>
                                    <span className="inline-flex items-center gap-1.5 text-sm opacity-80">
                                        <Clock size={13} />
                                        {formatThaiDate(taskData.createdAt, true)}
                                    </span>
                                </ReadValue>
                            </Field>
                            <Field label="ผู้บันทึก">
                                <ReadValue>
                                    <span className="inline-flex items-center gap-1.5 text-sm opacity-80">
                                        <User size={13} />
                                        {taskData.creatorName || "ไม่ระบุ"}
                                    </span>
                                </ReadValue>
                            </Field>
                        </div>
                    </SectionCard>

                    <SectionCard title="ผู้รับผิดชอบ" icon={<Users size={19} style={{ color: "var(--header)" }} />}>
                        {!isEditing && (
                            <div className="flex flex-col gap-3">
                                {taskData.assignments && taskData.assignments.length > 0 ? (
                                    taskData.assignments.map((a, i) => (
                                        <div key={a.assignment_id || i} className="flex items-center gap-3">
                                            <div
                                                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                                                style={{ backgroundColor: avatarColorFor(a.role_or_name || a.personInCharge || "?") }}
                                            >
                                                {(a.personInCharge || a.role_or_name || "?").charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">{a.role_or_name || "-"}</p>
                                                {a.personInCharge && (
                                                    <p className="text-xs opacity-60 truncate">{a.personInCharge}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm opacity-60">{taskData.personInCharge || "ไม่ระบุผู้รับผิดชอบ"}</p>
                                )}
                            </div>
                        )}

                        {isEditing && draft && (
                            <div className="flex flex-col gap-3">
                                {draft.assignments.map((a, i) => (
                                    <div key={i} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center border border-(--shadow) rounded-lg p-3">
                                        <select
                                            value={a.user_id || ""}
                                            onChange={(e) => {
                                                const u = users.find((x) => x.id === e.target.value);
                                                updateAssignment(i, {
                                                    user_id: e.target.value || null,
                                                    role_or_name: a.role_or_name || u?.name || "",
                                                });
                                            }}
                                            className={`${inputClass} sm:flex-1`}
                                        >
                                            <option value="">— ไม่ผูกกับผู้ใช้ —</option>
                                            {users.map((u) => (
                                                <option key={u.id} value={u.id}>
                                                    {u.name}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            value={a.role_or_name}
                                            onChange={(e) => updateAssignment(i, { role_or_name: e.target.value })}
                                            placeholder="ตำแหน่ง / ชื่อ เช่น ฝอ.1"
                                            className={`${inputClass} sm:flex-1`}
                                        />
                                        <button
                                            onClick={() => removeAssignment(i)}
                                            className="flex items-center justify-center rounded-lg px-3 py-2 bg-(--redBG) text-(--redText) hover:opacity-80 transition shrink-0"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={addAssignment}
                                    className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium border-2 border-dashed border-(--shadow) hover:bg-(--wrapper) transition"
                                >
                                    <Plus size={15} /> เพิ่มผู้รับผิดชอบ
                                </button>
                            </div>
                        )}
                    </SectionCard>
                </div>
            </div>

            {/* ---------- Audit log (superadmin only) ---------- */}
            {currentUser?.role === "superadmin" && (
                <SectionCard className="mt-2">
                    <button
                        onClick={() => setShowLogs((v) => !v)}
                        className="flex items-center justify-between w-full text-left"
                    >
                        <span className="flex items-center gap-2 font-bold text-lg" style={{ color: "var(--header)" }}>
                            <History size={19} />
                            บันทึกประวัติการเปลี่ยนแปลง
                            <span className="text-sm font-normal opacity-50">({logs.length})</span>
                        </span>
                        <ChevronDown size={20} className={`transition-transform ${showLogs ? "rotate-180" : ""}`} />
                    </button>

                    {showLogs && (
                        <div className="overflow-x-auto mt-4 -mx-1">
                            <table className="w-full text-left border-collapse min-w-[560px]">
                                <thead>
                                    <tr className="border-b border-(--shadow)">
                                        <th className="p-3 text-sm font-semibold opacity-60">เวลา</th>
                                        <th className="p-3 text-sm font-semibold opacity-60">ผู้ใช้งาน</th>
                                        <th className="p-3 text-sm font-semibold opacity-60">เหตุการณ์</th>
                                        <th className="p-3 text-sm font-semibold opacity-60">รายละเอียด</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log.id} className="border-b border-(--shadow) hover:bg-(--wrapper)/50 transition">
                                            <td className="p-3 text-sm whitespace-nowrap">{formatThaiDate(log.created_at, true)}</td>
                                            <td className="p-3">
                                                {log.user_name ? (
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs shrink-0"
                                                            style={{ backgroundColor: log.user_color || "#3B82F6" }}
                                                        >
                                                            {log.user_name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="text-sm font-medium">{log.user_name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm opacity-50">ระบบ</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-sm">
                                                {log.action === "created_task"
                                                    ? "สร้างงาน"
                                                    : log.action === "updated_status"
                                                    ? "อัปเดตสถานะ"
                                                    : log.action === "updated_details"
                                                    ? "แก้ไขข้อมูล"
                                                    : log.action === "assigned_user"
                                                    ? "มอบหมายงาน"
                                                    : log.action === "deleted_task"
                                                    ? "ลบงาน"
                                                    : log.action}
                                            </td>
                                            <td className="p-3 text-xs opacity-60 max-w-xs truncate" title={log.details}>
                                                {log.details || "-"}
                                            </td>
                                        </tr>
                                    ))}
                                    {logs.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-6 text-center text-sm opacity-50">
                                                ไม่มีประวัติการเปลี่ยนแปลง
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionCard>
            )}
        </div>
    );
}