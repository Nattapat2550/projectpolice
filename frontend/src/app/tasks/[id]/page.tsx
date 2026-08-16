"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
    FolderOpen,
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

import { CreatableCombobox } from "@/components/CreatableCombobox";

interface AttachmentDoc {
    id: string;
    filename: string;
    drive_web_view_link?: string;
    notes?: string;
    created_at?: string;
    created_by?: string;
    uploader_name?: string;
}

interface Assignment {
    assignment_id?: string;
    user_id: string | null;
    role_or_name: string;
    personInCharge?: string;
    color?: string;
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
    sender?: string | null;
    recipient_to?: string | null;
    main_text?: string | null;
    task_detail?: string | null;
    notes?: string | null;
    memo_no?: string | null;
    memo_date?: string | null;
    urgency_level?: UrgencyLevel;
    secret_level?: SecretLevel;
    receive_no?: number | null;
    receive_year?: number | null;
    createdAt?: string;
    sign_date?: string | null;
    meeting_date?: string | null;
    reply_due_date?: string | null;
    created_by?: string;
    creatorName?: string;
    document_link?: string | null;
    assignments: Assignment[];
    attached_documents?: AttachmentDoc[];
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

function avatarColorFor(seed: string, color?: string) {
    if (color && color.startsWith('#') && color !== '#e5e7eb') return color;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function cleanTitleOrRank(str: string): string {
    if (!str) return '';
    let s = str.trim();
    s = s.replace(/[\(\[\（].*?[\)\]\）]/g, '').trim();
    s = s.replace(/^(?:พล\.ต\.อ\.|พล\.ต\.ท\.|พล\.ต\.ต\.|พ\.ต\.อ\.|พ\.ต\.ท\.|พ\.ต\.ต\.|ร\.ต\.อ\.|ร\.ต\.ท\.|ร\.ต\.ต\.|ด\.ต\.|จ\.ส\.ต\.|ส\.ต\.อ\.|ส\.ต\.ท\.|ส\.ต\.ต\.|นาย|นางสาว|นาง|น\.ส\.)\s*/gi, '').trim();
    return s || str.trim();
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function getValidExternalUrl(url?: string | null): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return trimmed;
    }
    if (trimmed.startsWith("www.") || trimmed.includes("drive.google.com") || trimmed.includes("docs.google.com")) {
        return `https://${trimmed}`;
    }
    return null;
}

function normalizeToCE(value?: string | null): string | null {
    if (!value) return null;
    let str = value.trim();
    const match = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
        let year = parseInt(match[1], 10);
        if (year > 2400) {
            year -= 543;
            str = `${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}${str.slice(match[0].length)}`;
        }
    }
    return str;
}

function formatThaiDate(value?: string | null, withTime = false) {
    if (!value) return "-";
    const cleanValue = normalizeToCE(value);
    if (!cleanValue) return "-";
    const d = new Date(cleanValue);
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
    let str = value.trim();
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
}

function toDateTimeInputValue(value?: string | null) {
    if (!value) return "";
    let str = value.trim();
    const match = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2}))?/);
    if (match) {
        let year = parseInt(match[1], 10);
        if (year > 2400) year -= 543;
        const timePart = match[4] ? `T${match[4].padStart(2, "0")}:${match[5].padStart(2, "0")}` : "T00:00";
        return `${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}${timePart}`;
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return "";
    let year = d.getFullYear();
    if (year > 2400) year -= 543;
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${year}-${m}-${day}T${hh}:${mm}`;
}

function formatReceiveYear(year?: number | string | null) {
    if (!year) return "";
    const numYear = typeof year === "string" ? parseInt(year, 10) : year;
    if (isNaN(numYear) || numYear === 0) return year.toString();
    if (numYear < 2400) {
        return (numYear + 543).toString();
    }
    return numYear.toString();
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

function renderFormattedText(text: string | null | undefined) {
    if (!text) return null;
    const parts = text.split(/(\*\*[\s\S]*?\*\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
            const content = part.slice(2, -2);
            return (
                <strong key={index} className="font-bold text-[1rem] block my-1" style={{ color: "var(--header)" }}>
                    {content}
                </strong>
            );
        }
        return part;
    });
}

function convertThaiDigits(str?: string | null): string {
    if (!str) return "";
    const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
    return String(str).replace(/[๐-๙]/g, (m) => thaiDigits.indexOf(m).toString());
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
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [reviewModalData, setReviewModalData] = useState<any | null>(null);
    const overwriteInputRef = useRef<HTMLInputElement>(null);
    const attachInputRef = useRef<HTMLInputElement>(null);
    const titleRef = useRef<HTMLTextAreaElement>(null);
    const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

    const handleCancelReviewModal = async () => {
        if (reviewModalData?.tempFilePath) {
            try {
                const token = getToken();
                await fetch(`${backendUrl}/api/v1/documents/delete-temp-files`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ path: reviewModalData.tempFilePath }),
                });
            } catch (e) {}
        }
        setReviewModalData(null);
    };

    const handleConfirmReviewSave = async () => {
        if (!reviewModalData || !id) return;
        try {
            setSaving(true);
            const payload: Record<string, any> = {};
            if (reviewModalData.notes?.apply) payload.notes = reviewModalData.notes.newVal;
            if (reviewModalData.sign_date?.apply) payload.sign_date = reviewModalData.sign_date.newVal;
            if (reviewModalData.meeting_date?.apply) payload.meeting_date = reviewModalData.meeting_date.newVal;
            if (reviewModalData.reply_due_date?.apply) payload.reply_due_date = reviewModalData.reply_due_date.newVal;
            if (reviewModalData.title?.apply) payload.name = reviewModalData.title.newVal;
            if (reviewModalData.memo_no?.apply) payload.memo_no = convertThaiDigits(reviewModalData.memo_no.newVal);
            if (reviewModalData.sender?.apply) payload.sender = reviewModalData.sender.newVal;
            if (reviewModalData.recipient_to?.apply) payload.recipient_to = reviewModalData.recipient_to.newVal;
            if (reviewModalData.memo_date?.apply) payload.memo_date = reviewModalData.memo_date.newVal;
            if (reviewModalData.urgency_level?.apply) {
                payload.urgency_level = reviewModalData.urgency_level.newVal;
                payload.is_urgent = reviewModalData.urgency_level.newVal !== "ปกติ";
            }
            if (reviewModalData.secret_level?.apply) payload.secret_level = reviewModalData.secret_level.newVal;
            if (reviewModalData.assignments?.apply) payload.assignments = reviewModalData.assignments.newVal;
            if (reviewModalData.main_text?.apply) payload.main_text = reviewModalData.main_text.newVal;
            if (reviewModalData.task_detail?.apply) payload.task_detail = reviewModalData.task_detail.newVal;

            const token = getToken();

            // หากมี tempFilePath แสดงว่าเป็นขั้นตอนการยืนยันอัปโหลดทับเอกสาร
            if (reviewModalData.tempFilePath) {
                const res = await fetch(`${backendUrl}/api/v1/tasks/${id}/confirm-overwrite-doc`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                        tempFilePath: reviewModalData.tempFilePath,
                        originalname: reviewModalData.originalname,
                        mimetype: reviewModalData.mimetype,
                        filename: reviewModalData.filename,
                        updates: payload,
                    }),
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    setReviewModalData(null);
                    Swal.fire({
                        icon: "success",
                        title: "อัปโหลดทับสำเร็จ!",
                        text: data.message || "อัปโหลดเอกสารใหม่และบันทึกข้อมูลเรียบร้อยแล้ว",
                        timer: 2000,
                        showConfirmButton: false,
                    });
                    fetchTask();
                } else {
                    throw new Error(data.message || "ไม่สามารถอัปเดตข้อมูลทับเอกสารได้");
                }
            } else {
                const res = await fetch(`${backendUrl}/api/v1/tasks/${id}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify(payload),
                });

                if (res.ok) {
                    setReviewModalData(null);
                    Swal.fire({
                        icon: "success",
                        title: "บันทึกข้อมูลสำเร็จ!",
                        text: "อัปเดตข้อมูลที่เลือกเรียบร้อยแล้ว",
                        timer: 2000,
                        showConfirmButton: false,
                    });
                    fetchTask();
                } else {
                    throw new Error("ไม่สามารถอัปเดตข้อมูลได้");
                }
            }
        } catch (err: any) {
            Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: err.message || "ไม่สามารถอัปเดตข้อมูลได้" });
        } finally {
            setSaving(false);
        }
    };

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

    const handleOverwriteDocument = () => {
        if (!canEditTask) {
            Swal.fire({ icon: "error", title: "ไม่มีสิทธิ์แก้ไข", text: "คุณสามารถแก้ไขได้เฉพาะงานที่ตนเองได้รับผิดชอบหรือเป็นผู้สร้างเท่านั้น" });
            return;
        }
        overwriteInputRef.current?.click();
    };

    const handleAttachDocument = () => {
        if (!canEditTask) {
            Swal.fire({ icon: "error", title: "ไม่มีสิทธิ์แก้ไข", text: "คุณสามารถแก้ไขได้เฉพาะงานที่ตนเองได้รับผิดชอบหรือเป็นผู้สร้างเท่านั้น" });
            return;
        }
        attachInputRef.current?.click();
    };

    const onOverwriteDocSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !id) return;

        const confirm = await Swal.fire({
            title: "ยืนยันการอัปโหลดข้อมูลทับ?",
            html: `คุณกำลังเลือกไฟล์ <b>"${file.name}"</b> เพื่ออัปโหลดทับเอกสารเดิม<br/><br/><span style="font-size: 0.85rem; color: #d97706;">⚠️ AI จะอ่านสกัดข้อมูลจากไฟล์ใหม่นี้ และอัปเดตข้อมูลหัวข้อ/เลขที่/สาระสำคัญทับข้อมูลเดิม</span>`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "ยืนยันอัปโหลดทับ",
            cancelButtonText: "ยกเลิก",
            confirmButtonColor: "#d33",
            cancelButtonColor: "#6e7881",
        });

        if (!confirm.isConfirmed) {
            if (e.target) e.target.value = "";
            return;
        }

        setUploadingDoc(true);
        Swal.fire({
            title: "กำลังวิเคราะห์และสกัดข้อมูลด้วย AI...",
            text: "ระบบกำลังอ่านเนื้อหาในไฟล์และอัปเดตข้อมูลทับ กรุณารอสักครู่",
            allowOutsideClick: false,
            allowEscapeKey: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const formData = new FormData();
            formData.append("file", file);
            const token = getToken();
            const res = await fetch(`${backendUrl}/api/v1/tasks/${id}/overwrite-doc`, {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: formData,
            });
            const data = await res.json();
            if (res.ok && data.success) {
                const memo = data.data?.extractedMemo || {};
                Swal.close();
                const memoNoClean = convertThaiDigits(memo.ที่);
                const assignStr = Array.isArray(memo.assignments)
                    ? memo.assignments.map((a: any) => typeof a === 'string' ? a : a.responsible_person || a.role_or_name || "").filter(Boolean).join(", ")
                    : (memo.assignments || "");

                const currentAssignStr = Array.isArray(taskData?.assignments)
                    ? taskData.assignments.map((a: any) => a.user_name || a.role_or_name || "").filter(Boolean).join(", ")
                    : "";

                setReviewModalData({
                    tempFilePath: data.data?.tempFilePath || "",
                    originalname: data.data?.originalname || file.name,
                    mimetype: data.data?.mimetype || file.type,
                    filename: data.data?.filename || file.name,
                    notes: { oldVal: taskData?.notes || "", newVal: memo.notes || memo.หมายเหตุ || "", apply: Boolean(memo.notes || memo.หมายเหตุ) },
                    sign_date: { oldVal: taskData?.sign_date ? String(taskData.sign_date).split("T")[0] : "", newVal: memo.sign_date || "", apply: Boolean(memo.sign_date) },
                    meeting_date: { oldVal: taskData?.meeting_date ? String(taskData.meeting_date).split("T")[0] : "", newVal: memo.meeting_date || "", apply: Boolean(memo.meeting_date) },
                    reply_due_date: { oldVal: taskData?.reply_due_date ? String(taskData.reply_due_date).split("T")[0] : "", newVal: memo.reply_due_date || "", apply: Boolean(memo.reply_due_date) },
                    assignments: { oldVal: currentAssignStr || "", newVal: assignStr || "", apply: Boolean(assignStr) },
                    main_text: { oldVal: taskData?.main_text || "", newVal: memo.main_text || "", apply: Boolean(memo.main_text) },
                    task_detail: { oldVal: taskData?.task_detail || "", newVal: memo.task_detail || "", apply: Boolean(memo.task_detail) },
                });
            } else {
                Swal.fire({
                    icon: "error",
                    title: "ไฟล์ไม่ตรงกับงานนี้!",
                    text: data.message || "ไม่สามารถอัปโหลดข้อมูลทับได้ กรุณาลองใหม่อีกครั้ง"
                });
            }
        } catch (err: any) {
            Swal.fire({
                icon: "error",
                title: "เกิดข้อผิดพลาดในการอัปโหลด",
                text: err.message || "ไม่สามารถอัปโหลดข้อมูลทับได้ กรุณาลองใหม่อีกครั้ง"
            });
        } finally {
            setUploadingDoc(false);
            if (e.target) e.target.value = "";
        }
    };

    const onAttachDocSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0 || !id) return;
        const files = Array.from(fileList);

        // 🔒 จำกัดการอัปโหลดเอกสารแนบเพิ่มเติมไม่เกิน 3 ไฟล์
        if (files.length > 3) {
            Swal.fire({
                icon: "warning",
                title: "จำกัดการอัปโหลดสูงสุด 3 ไฟล์",
                text: `คุณเลือกไฟล์ทั้งหมด ${files.length} ไฟล์ ระบบรองรับการแนบเอกสารเพิ่มเติมได้สูงสุดครั้งละไม่เกิน 3 ไฟล์เท่านั้น กรุณาเลือกใหม่อีกครั้ง`,
                confirmButtonText: "ตกลง",
                confirmButtonColor: "#2563eb",
            });
            if (e.target) e.target.value = "";
            return;
        }

        let htmlContent = `
            <div style="text-align: left; font-size: 0.88rem; max-height: 350px; overflow-y: auto; padding: 4px;">
                <p style="margin-bottom: 12px; opacity: 0.8; font-weight: 500;">
                    โปรดตรวจสอบรายการไฟล์แนบที่ต้องการอัปโหลด และสามารถระบุ <b>หมายเหตุประจำไฟล์</b> เพิ่มเติมได้:
                </p>
        `;

        files.forEach((f, idx) => {
            const sizeMb = (f.size / (1024 * 1024)).toFixed(2);
            htmlContent += `
                <div style="background: rgba(125,125,125,0.08); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; border: 1px solid rgba(125,125,125,0.2);">
                    <div style="font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.88rem; margin-bottom: 4px;">
                        📄 ${idx + 1}. ${f.name} <span style="opacity: 0.6; font-size: 0.75rem; font-weight: normal;">(${sizeMb} MB)</span>
                    </div>
                    <input 
                        type="text" 
                        id="attach-note-input-${idx}" 
                        placeholder="ระบุหมายเหตุประจำไฟล์นี้ (ถ้ามี)..." 
                        style="width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 0.82rem; margin-top: 4px; box-sizing: border-box; outline: none; background: var(--button, #ffffff); color: var(--foreground, #000000);"
                    />
                </div>
            `;
        });
        htmlContent += `</div>`;

        const confirm = await Swal.fire({
            title: `ยืนยันการอัปโหลดเอกสารแนบเพิ่มเติม (${files.length} รายการ)?`,
            html: htmlContent,
            icon: "info",
            showCancelButton: true,
            confirmButtonText: "ยืนยันการอัปโหลด",
            cancelButtonText: "ยกเลิก",
            confirmButtonColor: "#2563eb",
            cancelButtonColor: "#6e7881",
            preConfirm: () => {
                const notes = files.map((_, idx) => {
                    const inputEl = document.getElementById(`attach-note-input-${idx}`) as HTMLInputElement;
                    return inputEl ? inputEl.value.trim() : "";
                });
                return notes;
            }
        });

        if (!confirm.isConfirmed || !confirm.value) {
            if (e.target) e.target.value = "";
            return;
        }

        const notesArray = confirm.value as string[];

        setUploadingDoc(true);
        try {
            const formData = new FormData();
            files.forEach((f) => formData.append("files", f));
            formData.append("notes", JSON.stringify(notesArray));

            const token = getToken();
            const res = await fetch(`${backendUrl}/api/v1/tasks/${id}/attach-doc`, {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: formData,
            });
            const data = await res.json().catch(() => null);
            if (res.ok && data?.success) {
                Swal.fire({ icon: "success", title: "อัปโหลดเอกสารเพิ่มเติมสำเร็จ", timer: 2000, showConfirmButton: false });
                fetchTask();
            } else {
                const errorMsg = data?.message || "ไม่สามารถอัปโหลดเอกสารเพิ่มเติมได้ กรุณาลองใหม่อีกครั้ง";
                Swal.fire({ icon: "warning", title: "ไม่สามารถอัปโหลดได้", text: errorMsg });
            }
        } catch (err: any) {
            console.error("Attach doc error:", err);
            Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: err.message || "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่ออัปโหลดเอกสารได้" });
        } finally {
            setUploadingDoc(false);
            if (e.target) e.target.value = "";
        }
    };

    const handleDeleteAttachment = async (attachmentId: string, filename: string) => {
        if (!canEditTask) {
            Swal.fire({ icon: "error", title: "ไม่มีสิทธิ์แก้ไข", text: "คุณสามารถแก้ไขได้เฉพาะงานที่ตนเองได้รับผิดชอบหรือเป็นผู้สร้างเท่านั้น" });
            return;
        }
        const confirm = await Swal.fire({
            title: `ลบเอกสาร "${filename}"?`,
            text: "คุณแน่ใจหรือไม่ที่จะลบเอกสารแนบนี้?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "ลบ",
            cancelButtonText: "ยกเลิก",
            confirmButtonColor: "#d33",
        });
        if (!confirm.isConfirmed) return;
        try {
            const token = getToken();
            const res = await fetch(`${backendUrl}/api/v1/tasks/${id}/attachments/${attachmentId}`, {
                method: "DELETE",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (res.ok) {
                Swal.fire({ icon: "success", title: "ลบเอกสารสำเร็จ", timer: 1500, showConfirmButton: false });
                fetchTask();
            }
        } catch (err) {
            Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาดในการลบเอกสาร" });
        }
    };

    const handleEditAttachmentNote = (attachmentId: string | number, currentNote?: string, filename?: string) => {
        if (!canEditTask) {
            Swal.fire({ icon: "error", title: "ไม่มีสิทธิ์แก้ไข", text: "คุณสามารถแก้ไขได้เฉพาะงานที่ตนเองได้รับผิดชอบหรือเป็นผู้สร้างเท่านั้น" });
            return;
        }
        Swal.fire({
            title: "แก้ไขหมายเหตุเอกสารแนบ",
            text: filename || "",
            input: "text",
            inputValue: currentNote || "",
            inputPlaceholder: "ระบุหมายเหตุ เช่น สำเนาฉบับเต็ม...",
            showCancelButton: true,
            confirmButtonText: "บันทึก",
            cancelButtonText: "ยกเลิก",
            confirmButtonColor: "#3085d6",
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    const token = getToken();
                    const res = await fetch(`${backendUrl}/api/v1/tasks/${id}/attachments/${attachmentId}/note`, {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                            ...(token ? { Authorization: `Bearer ${token}` } : {})
                        },
                        body: JSON.stringify({ notes: result.value || "" })
                    });
                    if (res.ok) {
                        Swal.fire({ icon: "success", title: "แก้ไขหมายเหตุสำเร็จ", timer: 1500, showConfirmButton: false });
                        fetchTask();
                    } else {
                        throw new Error("เกิดข้อผิดพลาดในการบันทึก");
                    }
                } catch (err: any) {
                    Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาดในการแก้ไขหมายเหตุ", text: err.message });
                }
            }
        });
    };

    function buildUpdateBody(source: TaskData) {
        return {
            name: source.name,
            date: normalizeToCE(source.date),
            memo_no: source.memo_no ? convertThaiDigits(source.memo_no) : source.memo_no,
            memo_date: normalizeToCE(source.memo_date),
            sender: source.sender,
            recipient_to: source.recipient_to,
            notes: source.notes,
            assignments: source.assignments,
            isUrgent: source.isUrgent ?? source.is_urgent,
            main_text: source.main_text,
            task_detail: source.task_detail,
            urgency_level: source.urgency_level,
            secret_level: source.secret_level,
            meeting_date: normalizeToCE(source.meeting_date),
            reply_due_date: normalizeToCE(source.reply_due_date),
            receive_no: source.receive_no,
            receive_date: normalizeToCE(source.date),
            sign_date: normalizeToCE(source.sign_date),
        };
    }

    const logoutAndRedirect = useCallback(() => {
        if (typeof window !== "undefined") {
            localStorage.removeItem("token");
            localStorage.removeItem("user_id");
            document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        }
        router.replace("/login");
    }, [router]);

    const fetchTask = useCallback(async () => {
        const token = getToken();
        if (!token) {
            logoutAndRedirect();
            return;
        }
        try {
            const res = await fetch(`${backendUrl}/api/v1/tasks/${id}`, {
                headers: getAuthHeaders(),
            });
            if (res.status === 401 || res.status === 403) {
                logoutAndRedirect();
                return;
            }
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
    }, [backendUrl, id, logoutAndRedirect]);

    const fetchMe = useCallback(async () => {
        try {
            const token = getToken();
            if (!token) return null;
            const res = await fetch(`${backendUrl}/api/v1/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401 || res.status === 403) {
                logoutAndRedirect();
                return null;
            }
            if (res.ok) {
                const data = await res.json();
                setCurrentUser(data.data);
                return data.data;
            }
        } catch {
            /* ignore */
        }
        return null;
    }, [backendUrl, logoutAndRedirect]);

    const fetchUsers = useCallback(async () => {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch(`${backendUrl}/api/v1/users`, {
                headers: getAuthHeaders(),
            });
            if (res.status === 401 || res.status === 403) {
                logoutAndRedirect();
                return;
            }
            if (res.ok) {
                const data = await res.json();
                setUsers(data.data || data.users || []);
            }
        } catch {
            /* ignore */
        }
    }, [backendUrl, logoutAndRedirect]);

    const fetchLogs = useCallback(
        async (token: string) => {
            try {
                const res = await fetch(`${backendUrl}/api/v1/tasks/${id}/logs`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.status === 401 || res.status === 403) {
                    logoutAndRedirect();
                    return;
                }
                if (res.ok) {
                    const data = await res.json();
                    setLogs(data.data || []);
                }
            } catch {
                /* ignore */
            }
        },
        [backendUrl, id, logoutAndRedirect]
    );

    const [suggestions, setSuggestions] = useState<{ senders: string[]; recipients: string[] }>({ senders: [], recipients: [] });

    const fetchSuggestions = useCallback(async () => {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch(`${backendUrl}/api/v1/tasks/suggestions`, {
                headers: getAuthHeaders(),
            });
            if (res.status === 401 || res.status === 403) {
                logoutAndRedirect();
                return;
            }
            if (res.ok) {
                const data = await res.json();
                setSuggestions({ senders: data.senders || [], recipients: data.recipients || [] });
            }
        } catch {}
    }, [backendUrl, logoutAndRedirect]);

    useEffect(() => {
        if (!id) return;
        const token = getToken();
        if (!token) {
            logoutAndRedirect();
            return;
        }
        fetchTask();
        fetchUsers();
        fetchSuggestions();
        fetchMe().then((user) => {
            if (user?.role === "superadmin") {
                if (token) fetchLogs(token);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    /* -------------------------- task ownership permission -------------------------- */
    const canEditTask = useMemo(() => {
        if (!currentUser || !taskData) return false;
        if (currentUser.role === "superadmin") return true;
        if (currentUser.role !== "admin") return false;

        // Check if created by current user
        if (taskData.created_by && String(taskData.created_by) === String(currentUser.id)) {
            return true;
        }

        // Check if assigned to current user
        const userName = currentUser.name?.trim().toLowerCase();
        const userId = String(currentUser.id);

        if (Array.isArray(taskData.assignments)) {
            const isAssigned = taskData.assignments.some((assign: any) => {
                if (typeof assign === "string") {
                    return assign.trim().toLowerCase() === userName;
                }
                if (assign && typeof assign === "object") {
                    if (assign.user_id && String(assign.user_id) === userId) return true;
                    const nameStr = assign.role_or_name || assign.name || assign.personInCharge || "";
                    if (nameStr && nameStr.trim().toLowerCase() === userName) return true;
                }
                return false;
            });
            if (isAssigned) return true;
        }

        if (taskData.personInCharge && typeof taskData.personInCharge === "string") {
            if (userName && taskData.personInCharge.toLowerCase().includes(userName)) {
                return true;
            }
        }

        return false;
    }, [currentUser, taskData]);

    /* -------------------------- actions -------------------------- */

    const startEditing = () => {
        if (!canEditTask) {
            Swal.fire({
                icon: "error",
                title: "ไม่มีสิทธิ์แก้ไข",
                text: "คุณสามารถแก้ไขได้เฉพาะงานที่ตนเองได้รับผิดชอบหรือเป็นผู้สร้างเท่านั้น",
            });
            return;
        }
        if (!taskData) return;
        const initialDraft = JSON.parse(JSON.stringify(taskData));
        if (Array.isArray(initialDraft.assignments)) {
            initialDraft.assignments = initialDraft.assignments.map((a: any) => {
                const u = users.find((x: any) => x.id === a.user_id || x.name === a.role_or_name || cleanTitleOrRank(x.name) === cleanTitleOrRank(a.role_or_name));
                return {
                    user_id: u ? u.id : (a.user_id || null),
                    role_or_name: u ? u.name : (a.role_or_name || a.personInCharge || ""),
                    color: u ? u.color : a.color
                };
            });
        }
        setDraft(initialDraft);
        setIsEditing(true);
    };

    const cancelEditing = () => {
        setDraft(null);
        setIsEditing(false);
    };

    const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
        if (!canEditTask) {
            Swal.fire({
                icon: "error",
                title: "ไม่มีสิทธิ์แก้ไข",
                text: "คุณสามารถแก้ไขได้เฉพาะงานที่ตนเองได้รับผิดชอบหรือเป็นผู้สร้างเท่านั้น",
            });
            return;
        }
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
        if (!canEditTask) {
            Swal.fire({
                icon: "error",
                title: "ไม่มีสิทธิ์แก้ไข",
                text: "คุณสามารถแก้ไขได้เฉพาะงานที่ตนเองได้รับผิดชอบหรือเป็นผู้สร้างเท่านั้น",
            });
            return;
        }
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
            Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: "ไม่สามารถอัปเดตชั้นความเร็วได้" });
        }
    };

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
                    className="rounded-full px-5 py-2.5 font-medium bg-(--wrapper) hover:bg-(--shadow) transition cursor-pointer select-none"
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
                        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium bg-(--wrapper) hover:bg-(--shadow) transition cursor-pointer select-none"
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
                            {(taskData.receive_no || taskData.receive_year) ? (
                                <span className="inline-flex items-center gap-1 text-sm font-medium rounded-full px-3 py-1 bg-(--wrapper)">
                                    <Hash size={13} /> {String(taskData.receive_no ?? "").padStart(4, "0")}{taskData.receive_year ? `/${formatReceiveYear(taskData.receive_year)}` : ""}
                                </span>
                            ) : taskData.memo_no ? (
                                <span className="inline-flex items-center gap-1 text-sm font-medium rounded-full px-3 py-1 bg-(--wrapper)">
                                    <Hash size={13} /> {taskData.memo_no}
                                </span>
                            ) : null}
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
                                        className="flex items-center gap-1.5 rounded-full px-4 py-2.5 font-medium text-sm text-(--button) transition hover:opacity-90 cursor-pointer select-none"
                                        style={{ backgroundColor: "var(--header)" }}
                                    >
                                        <Pencil size={15} /> แก้ไข
                                    </button>
                                )}
                                {canDelete && (
                                    <button
                                        onClick={handleDelete}
                                        className="flex items-center gap-1.5 rounded-full px-4 py-2.5 font-medium text-sm border-2 transition hover:opacity-80 bg-(--redBG) text-(--redText) border-(--redBorder) cursor-pointer select-none"
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
                                    className="flex items-center gap-1.5 rounded-full px-4 py-2.5 font-medium text-sm bg-(--wrapper) hover:bg-(--shadow) transition disabled:opacity-50 cursor-pointer select-none"
                                >
                                    <X size={15} /> ยกเลิก
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex items-center gap-1.5 rounded-full px-4 py-2.5 font-medium text-sm text-white transition hover:opacity-90 disabled:opacity-60 bg-(--greenBorder) cursor-pointer select-none"
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
                        className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all border-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none ${
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
                                    className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold border-2 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
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
                                    <input
                                        type="text"
                                        value={draft.memo_no || ""}
                                        onChange={(e) => updateDraft({ memo_no: e.target.value })}
                                        autoComplete="off"
                                        className={inputClass}
                                    />
                                ) : (
                                    <ReadValue>{taskData.memo_no || "-"}</ReadValue>
                                )}
                            </Field>
                            <Field label="วันที่หนังสือ">
                                {isEditing && draft ? (
                                    <input
                                        type="date"
                                        value={toDateInputValue(draft.memo_date)}
                                        onChange={(e) => updateDraft({ memo_date: e.target.value })}
                                        autoComplete="off"
                                        className={inputClass}
                                    />
                                ) : (
                                    <ReadValue>{formatThaiDate(taskData.memo_date)}</ReadValue>
                                )}
                            </Field>
                            <Field label="จาก (ส่วนราชการ)">
                                {isEditing && draft ? (
                                    <CreatableCombobox
                                        value={draft.sender || ""}
                                        onChange={(val) => updateDraft({ sender: val })}
                                        options={suggestions.senders}
                                        placeholder="พิมพ์หรือเลือกส่วนราชการ..."
                                    />
                                ) : (
                                    <ReadValue>{taskData.sender || "-"}</ReadValue>
                                )}
                            </Field>
                            <Field label="ถึง (เรียน)">
                                {isEditing && draft ? (
                                    <CreatableCombobox
                                        value={draft.recipient_to || ""}
                                        onChange={(val) => updateDraft({ recipient_to: val })}
                                        options={suggestions.recipients}
                                        placeholder="พิมพ์หรือเลือกเรียน..."
                                    />
                                ) : (
                                    <ReadValue>{taskData.recipient_to || "-"}</ReadValue>
                                )}
                            </Field>
                            <Field label="เลขรับที่">
                                {isEditing && draft ? (
                                    <input
                                        type="number"
                                        value={draft.receive_no ?? ""}
                                        onChange={(e) => updateDraft({ receive_no: e.target.value ? Number(e.target.value) : null })}
                                        autoComplete="off"
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
                                        autoComplete="off"
                                        className={inputClass}
                                    />
                                ) : (
                                    <ReadValue>{formatThaiDate(taskData.sign_date)}</ReadValue>
                                )}
                            </Field>
                            <Field label="ชั้นความเร็ว">
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
                            <div className="whitespace-pre-wrap leading-relaxed">{renderFormattedText(taskData.main_text) || "-"}</div>
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
                            <div className="whitespace-pre-wrap leading-relaxed">{renderFormattedText(taskData.task_detail) || "-"}</div>
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

                    {/* 📁 กล่องเอกสารประกอบเพิ่มเติม (วางไว้ล่างสุดฝั่งซ้าย) */}
                    <SectionCard
                        title={`เอกสารประกอบเพิ่มเติม ${taskData.attached_documents && taskData.attached_documents.length > 0 ? `(${taskData.attached_documents.length})` : ''}`}
                        icon={<FolderOpen size={19} style={{ color: "var(--header)" }} />}
                    >
                        {taskData.attached_documents && taskData.attached_documents.length > 0 ? (
                            <div className="divide-y divide-(--shadow)/40">
                                {taskData.attached_documents.map((doc) => (
                                    <div key={doc.id} className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                                <FileText size={18} className="text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate text-(--foreground)">{doc.filename}</p>
                                                {doc.notes && (
                                                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                                                        📌 หมายเหตุ: {doc.notes}
                                                    </p>
                                                )}
                                                <div className="flex flex-wrap items-center gap-1.5 text-xs opacity-70 mt-0.5">
                                                    {doc.uploader_name && (
                                                        <span className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
                                                            <User size={12} className="shrink-0" />
                                                            {doc.uploader_name}
                                                        </span>
                                                    )}
                                                    {doc.uploader_name && doc.created_at && <span>•</span>}
                                                    {doc.created_at && (
                                                        <span>{formatThaiDate(doc.created_at, true)}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {getValidExternalUrl(doc.drive_web_view_link) ? (
                                                <a
                                                    href={getValidExternalUrl(doc.drive_web_view_link)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition flex items-center gap-1.5"
                                                >
                                                    <LinkIcon size={13} />
                                                    เปิดดูเอกสาร
                                                </a>
                                            ) : (
                                                <span className="text-xs opacity-40">ไม่มีลิงก์</span>
                                            )}
                                            {canEdit && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEditAttachmentNote(doc.id, doc.notes, doc.filename)}
                                                        className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-500/10 transition cursor-pointer"
                                                        title="แก้ไขหมายเหตุเอกสารแนบ"
                                                    >
                                                        <Pencil size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteAttachment(doc.id, doc.filename)}
                                                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition cursor-pointer"
                                                        title="ลบเอกสารแนบ"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 opacity-60 text-sm">
                                ยังไม่มีเอกสารแนบเพิ่มเติม
                                {canEdit && (
                                    <div className="mt-2">
                                        <button
                                            type="button"
                                            onClick={handleAttachDocument}
                                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                        >
                                            <Plus size={13} /> กดที่นี่เพื่ออัปโหลดเอกสารเพิ่มเติม
                                        </button>
                                    </div>
                                )}
                            </div>
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
                                        autoComplete="off"
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
                                        autoComplete="off"
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
                                    taskData.assignments.map((a, i) => {
                                        const nameToShow = a.role_or_name || a.personInCharge || "-";
                                        return (
                                            <div key={a.assignment_id || i} className="flex items-center gap-3">
                                                <div
                                                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                                                    style={{ backgroundColor: avatarColorFor(nameToShow, a.color) }}
                                                >
                                                    {nameToShow.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium truncate">{nameToShow}</p>
                                                </div>
                                            </div>
                                        );
                                    })
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
                                                const selectedId = e.target.value;
                                                const u = users.find((x) => x.id === selectedId);
                                                updateAssignment(i, {
                                                    user_id: selectedId || null,
                                                    role_or_name: u?.name || "",
                                                });
                                            }}
                                            className={`${inputClass} sm:flex-1 cursor-pointer`}
                                        >
                                            <option value="">— เลือกผู้รับผิดชอบ —</option>
                                            {users.map((u) => (
                                                <option key={u.id} value={u.id}>
                                                    {u.name}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => removeAssignment(i)}
                                            className="flex items-center justify-center rounded-lg px-3 py-2 bg-(--redBG) text-(--redText) hover:opacity-80 transition shrink-0 cursor-pointer select-none"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={addAssignment}
                                    className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium border-2 border-dashed border-(--shadow) hover:bg-(--wrapper) transition cursor-pointer select-none"
                                >
                                    <Plus size={15} /> เพิ่มผู้รับผิดชอบ
                                </button>
                            </div>
                        )}
                    </SectionCard>

                    {/* 🌟 ปุ่มจัดการเอกสารอยู่ใต้กล่องผู้รับผิดชอบ */}
                    <div className="flex flex-col gap-2.5">
                        {getValidExternalUrl(taskData.document_link) && (
                            <a
                                href={getValidExternalUrl(taskData.document_link)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium bg-(--wrapper) hover:bg-(--shadow) transition border border-(--shadow) cursor-pointer select-none shadow-sm"
                            >
                                <LinkIcon size={15} />
                                เปิดเอกสารต้นฉบับ
                            </a>
                        )}

                        {canEdit && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleOverwriteDocument}
                                    disabled={uploadingDoc}
                                    style={{
                                        backgroundColor: "var(--orangeBG)",
                                        color: "var(--orangeText)",
                                        border: "1.5px solid var(--orangeBorder)",
                                    }}
                                    className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-xs transition hover:opacity-85 cursor-pointer select-none disabled:opacity-50"
                                >
                                    {uploadingDoc ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
                                    อัปโหลดข้อมูลทับ
                                </button>

                                <button
                                    type="button"
                                    onClick={handleAttachDocument}
                                    disabled={uploadingDoc}
                                    style={{
                                        backgroundColor: "var(--button)",
                                        color: "var(--blueText)",
                                        border: "1.5px solid var(--wrapper)",
                                    }}
                                    className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-xs transition hover:opacity-85 cursor-pointer select-none disabled:opacity-50"
                                >
                                    {uploadingDoc ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                    อัปโหลดเอกสารเพิ่มเติม
                                </button>

                                <input
                                    type="file"
                                    ref={overwriteInputRef}
                                    onChange={onOverwriteDocSelected}
                                    accept=".pdf,image/*,.docx"
                                    className="hidden"
                                />
                                <input
                                    type="file"
                                    ref={attachInputRef}
                                    onChange={onAttachDocSelected}
                                    accept=".pdf,image/*,.docx,.xlsx,.doc"
                                    multiple
                                    className="hidden"
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ---------- Audit log (superadmin only) ---------- */}
            {currentUser?.role === "superadmin" && (
                <SectionCard className="mt-2">
                    <button
                        onClick={() => setShowLogs((v) => !v)}
                        className="flex items-center justify-between w-full text-left cursor-pointer select-none"
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

            {/* Overwrite Review Modal */}
            {reviewModalData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
                    <div className="bg-(--button) border border-(--shadow) text-(--foreground) w-full max-w-3xl rounded-2xl p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-(--shadow) pb-3">
                            <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--header)" }}>
                                <FileText size={22} />
                                ตรวจสอบและเลือกข้อมูลหลังสแกนเอกสาร
                            </h3>
                            <button
                                onClick={handleCancelReviewModal}
                                className="p-1.5 rounded-full hover:bg-(--wrapper) transition cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <p className="text-sm opacity-80">
                            ระบบได้ทำการสแกนข้อมูลจากไฟล์ใหม่เรียบร้อยแล้ว โปรดเลือกและตรวจสอบข้อมูลที่ต้องการอัปเดตทับข้อมูลเดิม:
                        </p>

                        <div className="space-y-4">
                            {([
                                { key: "notes", label: "หมายเหตุ", type: "text" },
                                { key: "sign_date", label: "วันที่ลงนาม", type: "date" },
                                { key: "meeting_date", label: "วันประชุม", type: "date" },
                                { key: "reply_due_date", label: "วันตอบรับ", type: "date" },
                                { key: "assignments", label: "ผู้รับผิดชอบ / มอบหมายงาน", type: "text" },
                                { key: "main_text", label: "เนื้อหาเรื่อง / สาระสำคัญ", type: "textarea" },
                                { key: "task_detail", label: "รายละเอียดการมอบหมายงาน", type: "textarea" },
                            ] as { key: string; label: string; type: string; options?: string[] }[]).map((field) => {
                                const item = reviewModalData[field.key];
                                if (!item) return null;
                                return (
                                    <div key={field.key} className="p-3.5 rounded-xl border border-(--shadow)/60 bg-(--container)/50 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="flex items-center gap-2 font-bold text-sm cursor-pointer" style={{ color: "var(--header)" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={item.apply}
                                                    onChange={(e) =>
                                                        setReviewModalData((prev: any) => ({
                                                            ...prev,
                                                            [field.key]: { ...prev[field.key], apply: e.target.checked },
                                                        }))
                                                    }
                                                    className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                                                />
                                                อัปเดต {field.label}
                                            </label>
                                            {item.oldVal && (
                                                <span className="text-xs opacity-60 truncate max-w-xs">
                                                    เดิม: {item.oldVal}
                                                </span>
                                            )}
                                        </div>

                                        {field.type === "textarea" ? (
                                            <textarea
                                                value={item.newVal}
                                                disabled={!item.apply}
                                                onChange={(e) =>
                                                    setReviewModalData((prev: any) => ({
                                                        ...prev,
                                                        [field.key]: { ...prev[field.key], newVal: e.target.value },
                                                    }))
                                                }
                                                rows={3}
                                                className={`${inputClass} text-sm resize-y leading-relaxed disabled:opacity-40`}
                                            />
                                        ) : field.type === "select" ? (
                                            <select
                                                value={item.newVal}
                                                disabled={!item.apply}
                                                onChange={(e) =>
                                                    setReviewModalData((prev: any) => ({
                                                        ...prev,
                                                        [field.key]: { ...prev[field.key], newVal: e.target.value },
                                                    }))
                                                }
                                                className={`${inputClass} text-sm disabled:opacity-40`}
                                            >
                                                {field.options?.map((opt: string) => (
                                                    <option key={opt} value={opt}>
                                                        {opt}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type={field.type || "text"}
                                                value={item.newVal}
                                                disabled={!item.apply}
                                                onChange={(e) =>
                                                    setReviewModalData((prev: any) => ({
                                                        ...prev,
                                                        [field.key]: { ...prev[field.key], newVal: e.target.value },
                                                    }))
                                                }
                                                className={`${inputClass} text-sm disabled:opacity-40`}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-(--shadow)">
                            <button
                                type="button"
                                onClick={handleCancelReviewModal}
                                className="px-4 py-2 rounded-xl text-sm font-medium bg-(--wrapper) hover:bg-(--shadow) transition cursor-pointer"
                            >
                                ยกเลิก (คงข้อมูลเดิม)
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmReviewSave}
                                disabled={saving}
                                className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition cursor-pointer shadow-sm disabled:opacity-50"
                            >
                                {saving ? "กำลังบันทึก..." : "ยืนยันบันทึกข้อมูลที่เลือก"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}