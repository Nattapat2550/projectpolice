"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./fileUploader.module.css";
import Swal from "sweetalert2";
import Select from "react-select";

interface ResponsibilityAssignment {
    responsible_person: string;
    user_id?: string; 
    topics: string[];
}

interface MemoData {
    ที่?: string;
    วันที่?: string; 
    เวลา?: string;
    จาก?: string;
    sender?: string;
    เรื่อง?: string;
    เรียน?: string;
    main_text?: string;
    task_detail?: string;
    meeting_date?: string;
    reply_due_date?: string;
    urgency_level?: string;
    secret_level?: string;
    receive_no?: string;
    receive_date?: string;
    sign_date?: string;
    recipient_to?: string;
    additional_docs?: string;
    notes?: string;
    หมายเหตุ?: string;
    assignments?: ResponsibilityAssignment[];
    due_date?: string; 
    isUrgent?: boolean;
    is_duplicate?: boolean;
}

interface FileResult {
    filename: string;
    status: string;
    documentId?: number; 
    viewLink?: string;
    extractedData: MemoData[];
    fileInfo?: any; 
    error?: string;
}

interface FileData {
    filename: string;
    documentId?: number;
    fileInfo?: any; 
    deadline: string;
    selectedAssignees: string[]; 
    memos: MemoData[];
}

interface UploadedProps {
    extractedData: FileResult[] | null;
    onClearExtractedData?: () => void;
}

const parseThaiDate = (dateStr: string | undefined): Date | null => {
    if (!dateStr) return null;
    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const thaiMonthsAbbr = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const regex = /(\d{1,2})\s*(.+?)\s*(\d{4})/;
    const match = dateStr.match(regex);
    if (!match) return null; 

    const day = parseInt(match[1]);
    const monthStr = match[2].trim();
    let year = parseInt(match[3]);
    if (year > 2400) year -= 543;

    let monthIndex = thaiMonths.findIndex(m => m === monthStr);
    if (monthIndex === -1) monthIndex = thaiMonthsAbbr.findIndex(m => m === monthStr);
    if (monthIndex === -1) monthIndex = thaiMonths.findIndex(m => monthStr.includes(m)); 

    return monthIndex === -1 ? null : new Date(year, monthIndex, day);
};

export default function Uploaded({ extractedData, onClearExtractedData }: UploadedProps) {
    const router = useRouter();

    const [users, setUsers] = useState<any[]>([]);
    const [filesData, setFilesData] = useState<FileData[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [openDropdownIdx, setOpenDropdownIdx] = useState<number | null>(null);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const token = typeof window !== 'undefined' ? localStorage.getItem("token") || document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] : null;
                const headers: HeadersInit = {};
                if (token) headers["Authorization"] = `Bearer ${token}`;

                const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003"}/api/v1/users`, { headers });
                if (res.ok) {
                    const data = await res.json();
                    setUsers(data.data || []);
                }
            } catch (err) {
                console.error("Fetch users failed", err);
            }
        };
        fetchUsers();
    }, []);

    useEffect(() => {
        const loggedInUserId = typeof window !== 'undefined' ? String(localStorage.getItem("user_id") || localStorage.getItem("userId") || "") : "";
        
        if (extractedData && Array.isArray(extractedData)) {
            const initialized = extractedData
                .filter(file => file.status === "success")
                .map(file => {
                    const strictFilteredMemos = (file.extractedData || []).filter(memo => {
                        // ผ่อนปรนเงื่อนไขสำหรับ Local OCR: ขอแค่มีข้อมูลบางส่วนก็ให้ผ่านได้
                        return memo.ที่?.trim() || memo.วันที่?.trim() || memo.เรื่อง?.trim() || memo.เรียน?.trim() || memo.main_text?.trim();
                    });

                    const scannedAssignees = new Set<string>();

                    const processedMemos = strictFilteredMemos.map(memo => {
                        const originalAssignments = memo.assignments || [];
                        const allScannedTopics: string[] = []; 

                        originalAssignments.forEach(scanAssign => {
                            let rawTopics = scanAssign.topics || [];
                            if (!Array.isArray(rawTopics)) rawTopics = [String(rawTopics)];
                            
                            if (rawTopics.length > 0) {
                                allScannedTopics.push(...rawTopics);
                            }

                            const normalizeStr = (s?: string) => {
                                if (!s) return "";
                                return s.replace(/[๐-๙]/g, c => '0123456789'[c.charCodeAt(0) - 3664]).replace(/\s+/g, '').toLowerCase();
                            };

                            const normScanPerson = normalizeStr(scanAssign.responsible_person);
                            
                            const matchedUser = users.find(u => {
                                const normRole = normalizeStr(u.role);
                                const normName = normalizeStr(u.name);
                                if (!normScanPerson) return false;
                                return (normRole && (normRole === normScanPerson || normScanPerson.includes(normRole) || normRole.includes(normScanPerson))) ||
                                       (normName && (normName === normScanPerson || normScanPerson.includes(normName) || normName.includes(normScanPerson)));
                            });

                            if (matchedUser) {
                                scannedAssignees.add(String(matchedUser.id || matchedUser._id)); 
                            }
                        });

                        return {
                            ...memo,
                            isUrgent: memo.isUrgent || false,
                            task_detail: memo.task_detail || "",
                            meeting_date: memo.meeting_date || "",
                            reply_due_date: memo.reply_due_date || "",
                            urgency_level: memo.urgency_level || "ปกติ",
                            secret_level: memo.secret_level || "ปกติ",
                            receive_no: memo.receive_no || "",
                            receive_date: memo.receive_date || "",
                            sign_date: memo.sign_date || ""
                        };
                    });

                    const assigneesArray = Array.from(scannedAssignees);
                    const finalAssignees = assigneesArray.length > 0 ? assigneesArray : (loggedInUserId ? [loggedInUserId] : []);

                    return {
                        filename: file.filename,
                        documentId: file.documentId,
                        fileInfo: file.fileInfo, 
                        deadline: "14", 
                        selectedAssignees: finalAssignees, 
                        memos: processedMemos
                    };
                });
            setFilesData(initialized);
        }
    }, [extractedData, users]);

    const handleFileSettingChange = (fileIndex: number, field: keyof FileData, value: any) => {
        setFilesData(prev => prev.map((file, fIdx) => fIdx === fileIndex ? { ...file, [field]: value } : file));
    };

    const handleMemoChange = (fileIndex: number, memoIndex: number, field: keyof MemoData, value: string | boolean) => {
        setFilesData(prev => prev.map((file, fIdx) => {
            if (fIdx !== fileIndex) return file;
            return {
                ...file,
                memos: file.memos.map((memo, mIdx) => mIdx === memoIndex ? { ...memo, [field]: value } : memo)
            };
        }));
    };



    const handleConfirm = async () => {
        const validFiles = filesData.filter(file => file.memos.length > 0);
        
        // 💡 ใช้ SweetAlert2 แทน alert
        if (validFiles.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'ไม่พบข้อมูล',
                text: 'ไม่พบข้อมูลเอกสารที่สามารถบันทึกได้',
            });
            return;
        }

        const isAllSet = validFiles.every(f => f.deadline);
        if (!isAllSet) {
            // 💡 ใช้ SweetAlert2 แทน alert
            Swal.fire({
                icon: 'warning',
                title: 'ข้อมูลไม่ครบถ้วน',
                text: 'กรุณาเลือกระยะเวลาที่ต้องติดตามงาน และผู้รับผิดชอบให้ครบก่อนทำการบันทึก',
            });
            return;
        }

        setIsSaving(true);
        const currentUserId = typeof window !== 'undefined' ? String(localStorage.getItem("user_id") || localStorage.getItem("userId") || "") : "";

        try {
            for (const file of validFiles) {
                const isAllSelected = file.selectedAssignees.includes("all");
                let mappedAssignments: any[] = [];
                if (isAllSelected) {
                    mappedAssignments = [{ user_id: null, role_or_name: "all", responsible_person: "all" }];
                } else {
                    mappedAssignments = (file.selectedAssignees || []).map(uid => {
                        const u = users.find(x => String(x.id || x._id) === uid);
                        return {
                            user_id: u ? (u.id || u._id) : (uid !== "all" ? uid : null),
                            role_or_name: u ? u.name : uid,
                            responsible_person: u ? u.name : uid
                        };
                    });
                }

                const memosWithDueDate = file.memos.map(memo => {
                    let baseDate = parseThaiDate(memo.วันที่);
                    if (!baseDate || isNaN(baseDate.getTime())) baseDate = new Date();
                    baseDate.setDate(baseDate.getDate() + parseInt(file.deadline));
                    
                    return { 
                        ...memo, 
                        assignments: mappedAssignments.length > 0 ? mappedAssignments : (memo.assignments || []), 
                        due_date: baseDate.toISOString().split('T')[0] 
                    };
                });

                const token = typeof window !== 'undefined' ? localStorage.getItem("token") || document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] : null;
                const headers: HeadersInit = { "Content-Type": "application/json" };
                if (token) headers["Authorization"] = `Bearer ${token}`;

                const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003"}/api/v1/tasks/confirm`, {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify({ 
                        fileInfo: file.fileInfo,
                        documentId: file.documentId, 
                        memos: memosWithDueDate,
                        createdBy: currentUserId 
                    })
                });
                
                if (!res.ok) throw new Error(`เกิดข้อผิดพลาดในการบันทึกข้อมูลไฟล์: ${file.filename}`);
            }

            // 💡 ล้างไฟล์ที่ค้างอัปโหลดออกจากสเตตและหน่วยความจำ เพื่อไม่ให้ค้างหรือทำให้เครื่องช้า
            setFilesData([]);
            onClearExtractedData?.();

            // 💡 ใช้ SweetAlert2 แทน alert สำหรับความสำเร็จ
            Swal.fire({
                icon: 'success',
                title: 'บันทึกข้อมูลสำเร็จ!',
                text: 'เพิ่มงานติดตามเข้าสู่ระบบเรียบร้อยแล้ว',
                showConfirmButton: false,
                timer: 1500
            }).then(() => {
                router.push("/"); 
            });

        } catch (err: any) {
            // 💡 ใช้ SweetAlert2 แทน alert สำหรับข้อผิดพลาด
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: err.message || "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้",
            });
        } finally {
            setIsSaving(false);
        }
    };

    return(
        <div className="flex flex-col w-full h-full gap-4 flex-1 overflow-hidden pb-4 min-h-0">
            <h1 className={styles.Header} style={{ flexShrink: 0 }}>งานติดตามที่ตรวจอ่านได้</h1>
            <div className="flex-1 w-full overflow-y-auto pr-2 pb-4 flex flex-col gap-8 min-h-0">
                {filesData.length > 0 ? (
                    filesData.map((file, fileIdx) => (
                        <div key={fileIdx} className={`${styles.ContentWrapper} flex flex-col shrink-0 shadow-md h-auto`}>
                            <div className="bg-(--container) shrink-0 border-b border-(--shadow) z-10 w-full rounded-t-sm relative">
                                <div className="p-4 sm:px-6 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                    <div className="text-base font-bold text-(--header) flex items-center justify-between w-full lg:w-auto gap-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">📁</span>
                                            <span>สแกนจากไฟล์: <span className="text-blue-700 underline font-extrabold">{file.filename}</span></span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (file.fileInfo?.path) {
                                                    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
                                                    const token = typeof window !== 'undefined' ? localStorage.getItem("token") || "" : "";
                                                    fetch(`${backendUrl}/api/v1/documents/clean-temp`, {
                                                        method: "POST",
                                                        headers: {
                                                            "Content-Type": "application/json",
                                                            ...(token ? { "Authorization": `Bearer ${token}` } : {})
                                                        },
                                                        body: JSON.stringify({ paths: [file.fileInfo.path] }),
                                                        keepalive: true
                                                    }).catch(() => {});
                                                }
                                                const remaining = filesData.filter((_, idx) => idx !== fileIdx);
                                                setFilesData(remaining);
                                                if (remaining.length === 0) {
                                                    onClearExtractedData?.();
                                                }
                                            }}
                                            className="text-xs text-red-500 font-bold hover:text-red-700 hover:bg-red-500/10 px-2.5 py-1 rounded border border-red-500/20 transition cursor-pointer select-none shrink-0"
                                        >
                                            ✕ ลบไฟล์นี้ออก
                                        </button>
                                    </div>
                                    
                                    {file.memos.length > 0 && (
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-6 flex-wrap shrink-0">
                                            <div className="flex items-center gap-3">
                                                <strong className="shrink-0 whitespace-nowrap">ต้องติดตามใน</strong>
                                                <select 
                                                    className={`${styles.Dropdown} min-w-30`} 
                                                    value={file.deadline}
                                                    onChange={(e) => handleFileSettingChange(fileIdx, "deadline", e.target.value)}
                                                >
                                                    <option value="" disabled>เลือกระยะเวลา</option>
                                                    <option value="1">1 วัน</option>
                                                    <option value="3">3 วัน</option>
                                                    <option value="7">7 วัน</option>
                                                    <option value="14">14 วัน</option>
                                                </select>
                                            </div>
                                            
                                            <div className="flex flex-col gap-1 flex-1 min-w-[250px]">
                                                <strong className="shrink-0 whitespace-nowrap">มอบหมายให้ (เลือกได้หลายคน)</strong>
                                                <Select
                                                    isMulti
                                                    options={[
                                                        { value: "all", label: "📢 เลือกทั้งหมด (ทุกคน)" },
                                                        ...users.map(u => ({ value: String(u.id || u._id), label: `${u.name} ${u.role ? `(${u.role})` : ''}` }))
                                                    ]}
                                                    value={file.selectedAssignees.includes("all") 
                                                        ? [{ value: "all", label: "📢 เลือกทั้งหมด (ทุกคน)" }] 
                                                        : file.selectedAssignees.map(uid => {
                                                            const u = users.find(x => String(x.id || x._id) === uid);
                                                            return u ? { value: String(u.id || u._id), label: `${u.name} ${u.role ? `(${u.role})` : ''}` } : null;
                                                        }).filter(Boolean)}
                                                    onChange={(selectedOptions: any) => {
                                                        const isAllSelected = selectedOptions?.some((opt: any) => opt.value === "all");
                                                        let newAssignees: string[] = [];
                                                        if (isAllSelected) {
                                                            newAssignees = ["all"];
                                                        } else {
                                                            newAssignees = selectedOptions ? selectedOptions.map((opt: any) => opt.value) : [];
                                                        }
                                                        handleFileSettingChange(fileIdx, "selectedAssignees", newAssignees);
                                                    }}
                                                    placeholder="🔍 ค้นหาผู้รับผิดชอบ..."
                                                    className="text-sm w-full"
                                                    styles={{
                                                        control: (base) => ({
                                                            ...base,
                                                            backgroundColor: 'var(--wrapper)',
                                                            borderColor: 'var(--shadow)',
                                                            color: 'var(--foreground)',
                                                            minHeight: '38px',
                                                            borderRadius: '0.5rem'
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
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 sm:p-6 w-full bg-(--wrapper) overflow-y-auto rounded-b-sm" style={{ maxHeight: '60vh' }}>
                                {file.memos.length > 0 ? (
                                    <div className="flex flex-col gap-8">
                                        {file.memos.map((memo, index) => (
                                            <div key={index} className="text-sm flex flex-col gap-4 border-b border-(--shadow) pb-6 last:border-b-0 shrink-0">
                                                <h3 className="text-md font-bold" style={{ color: "var(--header)" }}>📄 เอกสารหน้าที่/ฉบับที่ {index + 1}</h3>
                                                <div className="flex flex-col gap-2 p-4 rounded-lg border bg-(--container) border-(--shadow) shrink-0 text-foreground">
                                                    {memo.is_duplicate && (
                                                        <div className="text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20 px-3 py-1.5 rounded-lg font-bold mb-1">
                                                            💡 ตรวจพบเลขรับซ้ำในรอบการตัดบัญชีปัจจุบัน (ระบบสแกนเฉพาะส่วนและซ่อนฟิลด์เดิมเพื่อความประหยัด)
                                                        </div>
                                                    )}
                                                    {!memo.is_duplicate && (
                                                        <>
                                                            <div className="flex items-center gap-2">
                                                                <strong className="w-28 shrink-0">ที่:</strong>
                                                                <input type="text" className="border border-(--shadow) p-1.5 rounded flex-1 focus:ring-2 focus:ring-blue-400 outline-none bg-(--button)" value={memo.ที่ || ''} onChange={(e) => handleMemoChange(fileIdx, index, "ที่", e.target.value)} />
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <strong className="w-28 shrink-0">วันที่:</strong>
                                                                <input type="text" className="border border-(--wrapper) p-1.5 rounded flex-1 font-bold text-(--blueText) focus:ring-2 focus:ring-blue-400 outline-none bg-(--button)" value={memo.วันที่ || ''} onChange={(e) => handleMemoChange(fileIdx, index, "วันที่", e.target.value)} />
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <strong className="w-28 shrink-0">จาก:</strong>
                                                                <input type="text" className="border border-(--wrapper) p-1.5 rounded flex-1 focus:ring-2 focus:ring-blue-400 outline-none bg-(--button)" value={memo.จาก || memo.sender || ''} onChange={(e) => { handleMemoChange(fileIdx, index, "จาก", e.target.value); handleMemoChange(fileIdx, index, "sender", e.target.value); }} />
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <strong className="w-28 shrink-0">ถึง (เรียน):</strong>
                                                                <input type="text" className="border border-(--wrapper) p-1.5 rounded flex-1 focus:ring-2 focus:ring-(--blueText) outline-none bg-(--button)" value={memo.recipient_to || memo.เรียน || ''} onChange={(e) => { handleMemoChange(fileIdx, index, "recipient_to", e.target.value); handleMemoChange(fileIdx, index, "เรียน", e.target.value); }} />
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <strong className="w-28 shrink-0">เรื่อง:</strong>
                                                                <input type="text" className="border border-(--wrapper) p-1.5 rounded flex-1 focus:ring-2 focus:ring-(--blueText) outline-none bg-(--button)" value={memo.เรื่อง || ''} onChange={(e) => handleMemoChange(fileIdx, index, "เรื่อง", e.target.value)} />
                                                            </div>
                                                        </>
                                                    )}
                                                    <div className="flex items-center gap-2">
                                                        <strong className="w-28 shrink-0">หมายเหตุ:</strong>
                                                        <input type="text" className="border border-(--wrapper) p-1.5 rounded flex-1 focus:ring-2 focus:ring-(--blueText) outline-none bg-(--button)" value={memo.notes || memo.หมายเหตุ || ''} onChange={(e) => { handleMemoChange(fileIdx, index, "notes", e.target.value); handleMemoChange(fileIdx, index, "หมายเหตุ", e.target.value); }} />
                                                    </div>
                                                    {!memo.is_duplicate && (
                                                        <div className="flex items-center gap-2">
                                                            <strong className="w-28 shrink-0">เวลา:</strong>
                                                            <input type="text" className="border border-(--wrapper) p-1.5 rounded flex-1 focus:ring-2 focus:ring-blue-400 outline-none bg-(--button)" value={memo.เวลา || ''} onChange={(e) => handleMemoChange(fileIdx, index, "เวลา", e.target.value)} />
                                                        </div>
                                                    )}
                                                    
                                                    <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-(--shadow)/60">
                                                        <div className="flex items-center gap-2">
                                                            <strong className="w-24 shrink-0">เลขรับ:</strong>
                                                            <input type="number" className="border border-(--wrapper) p-1.5 rounded flex-1 focus:ring-2 focus:ring-blue-400 outline-none bg-(--button)" value={memo.receive_no || ''} onChange={(e) => handleMemoChange(fileIdx, index, "receive_no", e.target.value)} />
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <strong className="w-24 shrink-0">วันที่รับ:</strong>
                                                            <input type="date" className="border border-(--wrapper) p-1.5 rounded flex-1 focus:ring-2 focus:ring-blue-400 outline-none bg-(--button)" value={memo.receive_date || ''} onChange={(e) => handleMemoChange(fileIdx, index, "receive_date", e.target.value)} />
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <strong className="w-24 shrink-0">วันที่ลงนาม:</strong>
                                                            <input type="date" className="border border-(--wrapper) p-1.5 rounded flex-1 focus:ring-2 focus:ring-blue-400 outline-none bg-(--button)" value={memo.sign_date || ''} onChange={(e) => handleMemoChange(fileIdx, index, "sign_date", e.target.value)} />
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-(--shadow)/60">
                                                        <strong className="w-24 shrink-0">วันประชุม:</strong>
                                                        <input type="date" className="border border-(--wrapper) p-1.5 rounded flex-1 focus:ring-2 focus:ring-blue-400 outline-none bg-(--button)" value={memo.meeting_date || ''} onChange={(e) => handleMemoChange(fileIdx, index, "meeting_date", e.target.value)} />
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-2">
                                                        <strong className="w-24 shrink-0">วันตอบรับ:</strong>
                                                        <input type="date" className="border border-(--wrapper) p-1.5 rounded flex-1 focus:ring-2 focus:ring-blue-400 outline-none bg-(--button)" value={memo.reply_due_date || ''} onChange={(e) => handleMemoChange(fileIdx, index, "reply_due_date", e.target.value)} />
                                                    </div>
                                                    
                                                    {!memo.is_duplicate && (
                                                        <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-(--shadow)/60">
                                                            <div className="flex items-center gap-2">
                                                                <strong className="w-24 shrink-0">ชั้นความเร็ว:</strong>
                                                                <select className="border border-(--wrapper) p-1.5 rounded flex-1 focus:ring-2 focus:ring-(--redText) outline-none bg-(--button)" value={memo.urgency_level || "ปกติ"} onChange={(e) => handleMemoChange(fileIdx, index, "urgency_level", e.target.value)}>
                                                                    <option value="ปกติ">ปกติ</option>
                                                                    <option value="ด่วน">ด่วน</option>
                                                                    <option value="ด่วนมาก">ด่วนมาก</option>
                                                                    <option value="ด่วนที่สุด">ด่วนที่สุด</option>
                                                                </select>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <strong className="w-24 shrink-0">ชั้นความลับ:</strong>
                                                                <select className="border border-(--wrapper) p-1.5 rounded flex-1 focus:ring-2 focus:ring-(--blueText) outline-none bg-(--button)" value={memo.secret_level || "ปกติ"} onChange={(e) => handleMemoChange(fileIdx, index, "secret_level", e.target.value)}>
                                                                    <option value="ปกติ">ปกติ</option>
                                                                    <option value="ลับ">ลับ</option>
                                                                    <option value="ลับมาก">ลับมาก</option>
                                                                    <option value="ลับที่สุด">ลับที่สุด</option>
                                                                </select>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <input type="checkbox" id={`urgent-${fileIdx}-${index}`} checked={memo.isUrgent || false} onChange={(e) => handleMemoChange(fileIdx, index, "isUrgent", e.target.checked)} className="w-4 h-4 cursor-pointer" style={{ accentColor: 'var(--redText)' }} />
                                                                <label htmlFor={`urgent-${fileIdx}-${index}`} className="cursor-pointer font-bold text-red-600">🔥 กำหนดให้เอกสารนี้เป็นงานเร่งด่วน</label>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="p-2 shrink-0 text-foreground">
                                                    <strong style={{ color: "var(--header)" }}>เนื้อหา:</strong>
                                                    <textarea 
                                                        className="mt-2 w-full border rounded p-3 text-foreground focus:ring-2 focus:ring-(--blueText) outline-none bg-(--button) border-(--wrapper)" 
                                                        rows={5} 
                                                        value={memo.main_text || ''} 
                                                        onChange={(e) => handleMemoChange(fileIdx, index, "main_text", e.target.value)} 
                                                    />
                                                </div>
                                                {file.selectedAssignees.length > 0 ? (
                                                    <div className="mt-2 shrink-0">
                                                        <strong className="text-base" style={{ color: "var(--header)" }}>การมอบหมายงาน/ความรับผิดชอบ:</strong>
                                                        <div className="flex flex-col gap-4 mt-3">
                                                            <div className="p-4 rounded-lg border shrink-0 text-foreground bg-(--container) border-(--shadow)">
                                                                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-(--shadow)/40 pb-3 mb-3">
                                                                    <p className="font-bold text-base text-green-700 leading-relaxed">
                                                                        มอบหมายให้: &nbsp;
                                                                        <span className="text-blue-700 bg-blue-50 px-2 py-1 rounded">
                                                                            {file.selectedAssignees.includes("all") 
                                                                                ? "📢 ทุกหน่วยงาน (ทุกคน)" 
                                                                                : file.selectedAssignees.map(uid => {
                                                                                    const u = users.find(x => String(x.id || x._id) === uid);
                                                                                    return u ? `${u.name} ${u.role ? `(${u.role})` : ''}` : '';
                                                                                }).filter(Boolean).join(', ')
                                                                            }
                                                                        </span>
                                                                    </p>
                                                                </div>
                                                                <div className="pl-2 sm:pl-4 border-l-2 border-(--shadow)/60">
                                                                    <div className="flex flex-row items-center justify-between mt-2 mb-2">
                                                                        <strong>สิ่งที่ต้องดำเนินการ (Task Detail):</strong>
                                                                    </div>
                                                                    <textarea 
                                                                        className="w-full border rounded p-3 text-foreground focus:ring-2 focus:ring-(--blueText) outline-none bg-(--button) border-(--shadow)" 
                                                                        rows={3} 
                                                                        value={memo.task_detail || ''} 
                                                                        onChange={(e) => handleMemoChange(fileIdx, index, "task_detail", e.target.value)} 
                                                                        placeholder="ระบุสิ่งที่ต้องดำเนินการ (สามารถใส่เป็น Checkbox ได้)..."
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="mt-4 shrink-0 p-5 bg-(--container) border border-(--shadow)/60 rounded-lg text-center shadow-sm">
                                                        <span className="text-(--foreground)/60 font-bold text-lg">⚠️ กรุณาเลือกผู้รับผิดชอบจากด้านบนก่อนเพิ่มรายละเอียดงาน</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-(--foreground)/50 text-center py-8">เอกสารมีข้อมูลไม่ครบถ้วน จึงถูกคัดกรองออก</div>
                                )}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-(--foreground)/50 text-center flex items-center justify-center h-full py-10 bg-(--container) rounded-lg border border-(--shadow)">ยังไม่มีข้อมูล กรุณาอัพโหลดเอกสารเพื่อสแกน</div>
                )}
            </div>
            
            <div className="flex flex-col md:flex-row md:justify-end gap-4 shrink-0">
                <button className={styles.Button} style={{ background: "var(--wrapper)", borderColor: "var(--shadow)" }} onClick={() => router.push('/')}>กลับหน้าหลัก</button>
                <button className={styles.Button} onClick={handleConfirm} disabled={isSaving || filesData.length === 0} style={{ opacity: isSaving || filesData.length === 0 ? 0.6 : 1 }}>{isSaving ? 'กำลังบันทึกข้อมูล...' : 'ยืนยันเพิ่มงานติดตาม'}</button>
            </div>
        </div>
    );
}