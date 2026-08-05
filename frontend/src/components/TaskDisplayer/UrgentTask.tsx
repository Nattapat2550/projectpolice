"use client";

import { useState, useEffect } from "react";
import TaskDisplayer from "./TaskDisplayer";
import styles from "./TaskDisplayer.module.css";
import PersonMultiSelect from "./PersonMultiSelect";
import StatusMultiSelect from "./StatusMultiSelect"; // 👈 Imported the multi-select component
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Link from "next/link";
import Swal from "sweetalert2";

type TaskStatus = "following" | "problem" | "completed";

// 💡 Global Cache แบบเดียวกับ Project Follow
const urgentTaskFetchCache = new Map<string, any[]>();

export default function UrgentTask() {
    const initialTaskData: any[] = [];

    const [tasks, setTasks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [statusFilter, setStatusFilter] = useState<string[]>([]); 
    const [personFilter, setPersonFilter] = useState<string[]>([]); 
    const [searchText, setSearchText] = useState("");
    const [urgencyFilter, setUrgencyFilter] = useState("");
    const [secrecyFilter, setSecrecyFilter] = useState("");

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        setCurrentPage(1);
    }, [statusFilter, personFilter, searchText, urgencyFilter, secrecyFilter]);

    useEffect(() => {
        const fetchUrgentTasks = async () => {
            try {
                const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
                const url = `${backendUrl}/api/v1/tasks/urgent`;

                // 💡 โหลดข้อมูลจาก Cache ทันทีเพื่อให้แสดงผลไวที่สุด (SWR Pattern)
                if (urgentTaskFetchCache.has(url)) {
                    setTasks(urgentTaskFetchCache.get(url)!);
                    setIsLoading(false);
                }

                const response = await fetch(url, { cache: "no-store" });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.length > 0) {
                        urgentTaskFetchCache.set(url, data); // อัปเดต Cache
                        setTasks(data);
                    } else {
                        setTasks(initialTaskData);
                    }
                } else {
                    if (!urgentTaskFetchCache.has(url)) setTasks(initialTaskData);
                }
            } catch (error) {
                if (!urgentTaskFetchCache.has(`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003"}/api/v1/tasks/urgent`)) {
                    setTasks(initialTaskData);
                }
            } finally {
                setIsLoading(false);
            }
        };
        fetchUrgentTasks();
    }, []);

    useEffect(() => {
        const handleTaskSync = (event: Event) => {
            const customEvent = event as CustomEvent<{ id: string; status: string }>;
            const { id, status } = customEvent.detail;
            setTasks((prevTasks) =>
                prevTasks.map((task) => task.id === id ? { ...task, status } : task)
            );
        };

        window.addEventListener("taskStatusSync", handleTaskSync);
        return () => window.removeEventListener("taskStatusSync", handleTaskSync);
    }, []);

    const handleStatusChange = async (id: string, newStatus: TaskStatus) => {
        try {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
            const token = typeof window !== 'undefined' ? localStorage.getItem("token") || document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] : null;
            const headers: HeadersInit = { "Content-Type": "application/json" };
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }

            const response = await fetch(`${backendUrl}/api/v1/tasks/${id}/status`, {
                method: "PUT",
                headers: headers,
                body: JSON.stringify({ status: newStatus }),
            });

            if (!response.ok) throw new Error("Failed to update status in database");

            setTasks((prevTasks) =>
                prevTasks.map((task) => task.id === id ? { ...task, status: newStatus } : task)
            );

            window.dispatchEvent(
                new CustomEvent("taskStatusSync", {
                    detail: { id, status: newStatus },
                })
            );
        } catch (error) {
            console.error("Failed to update task", error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถอัปเดตสถานะได้'
            });
        }
    };

    const handleReserveTask = async () => {
        const token = typeof window !== 'undefined' ? localStorage.getItem("token") || document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] : null;
        if (!token) {
            Swal.fire({ icon: 'warning', title: 'ไม่อนุญาต', text: 'กรุณาเข้าสู่ระบบก่อนจองเลขรับ' });
            return;
        }

        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
        
        try {
            // Fetch next receive number
            let nextNo = "";
            try {
                const resNo = await fetch(`${backendUrl}/api/v1/tasks/next-reserve-no`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (resNo.ok) {
                    const dataNo = await resNo.json();
                    nextNo = dataNo.nextReceiveNo?.toString() || "";
                }
            } catch (err) {
                console.error("Failed to fetch next reserve no", err);
            }

            const { value: rangeInput } = await Swal.fire({
                title: 'จองเลขรับ',
                html: 'ระบุเลขรับ หรือ ระบุเป็นช่วง (เช่น <b>100</b> หรือ <b>100-105</b>)',
                input: 'text',
                inputValue: nextNo,
                showCancelButton: true,
                confirmButtonText: 'ยืนยันการจอง',
                cancelButtonText: 'ยกเลิก',
                inputValidator: (value) => {
                    if (!value) return 'กรุณาระบุเลขรับที่ต้องการจอง';
                    if (!/^\d+(-\d+)?$/.test(value.trim())) return 'รูปแบบไม่ถูกต้อง (เช่น 100 หรือ 100-105)';
                    if (value.includes('-')) {
                        const parts = value.split('-');
                        if (parseInt(parts[0], 10) > parseInt(parts[1], 10)) {
                            return 'เลขเริ่มต้นต้องน้อยกว่าหรือเท่ากับเลขสิ้นสุด';
                        }
                    }
                }
            });

            if (rangeInput) {
                const response = await fetch(`${backendUrl}/api/v1/tasks/reserve`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ range: rangeInput.trim() })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.message || "Failed to reserve task");
                }
                
                const data = await response.json();
                if (data.startNo === data.endNo) {
                    Swal.fire('สำเร็จ', `จองเลขรับสำเร็จ! เลขรับที่ได้คือ: ${data.startNo}/${data.receive_year > 2400 ? data.receive_year : data.receive_year + 543}${data.round ? ` (รอบ ${data.round})` : ''}`, 'success');
                } else {
                    Swal.fire('สำเร็จ', `จองเลขรับจำนวน ${data.createdCount || data.count || 1} รายการ สำเร็จ! ตั้งแต่เลขที่: ${data.startNo}/${data.receive_year > 2400 ? data.receive_year : data.receive_year + 543}${data.round ? ` (รอบ ${data.round})` : ''} ถึง ${data.endNo}/${data.receive_year > 2400 ? data.receive_year : data.receive_year + 543}${data.round ? ` (รอบ ${data.round})` : ''}`, 'success');
                }
                
                // รีเฟรชข้อมูลหน้าเว็บหลังจองสำเร็จ (ใช้ window.location.reload แทนเพื่อให้ UI รีเฟรชเต็มรูปแบบ)
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            }
        } catch (error: any) {
            Swal.fire('เกิดข้อผิดพลาด', error.message || 'ไม่สามารถจองเลขรับได้', 'error');
        }
    };

    const allPersons = tasks.flatMap(t => {
        if (!t.personInCharge) return [];
        return t.personInCharge.split(',').map((s: string) => s.trim()).filter(Boolean);
    });
    const uniquePersons = Array.from(new Set(allPersons));

    const filteredTasks = tasks.filter((task) => {
        // 💡 Updated to evaluate whether the task's status exists within the filter array
        const matchStatus = statusFilter.length === 0 || statusFilter.includes(task.status);
        
        const taskPersons = task.personInCharge 
            ? task.personInCharge.split(',').map((s: string) => s.trim()) 
            : [];

        const matchPerson =
            personFilter.length === 0 || 
            taskPersons.includes("ทุกหน่วยงาน") ||
            taskPersons.some((p: string) => personFilter.includes(p)); 

        const normalizeDigits = (str?: any) => str ? String(str).replace(/[๐-๙]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0e50 + 48)) : '';
        const searchTokens = searchText.toLowerCase().split(/\s+/).filter(Boolean);
        const matchSearch = searchTokens.length === 0 || searchTokens.every(rawToken => {
            const token = normalizeDigits(rawToken);
            return (
                normalizeDigits(task.name?.toLowerCase()).includes(token) || 
                normalizeDigits(task.personInCharge?.toLowerCase()).includes(token) ||
                normalizeDigits(task.urgency_level?.toLowerCase()).includes(token) ||
                normalizeDigits(task.secret_level?.toLowerCase()).includes(token) ||
                normalizeDigits(task.id?.toString().toLowerCase()).includes(token) ||
                normalizeDigits(task.receive_no?.toString().toLowerCase()).includes(token) ||
                normalizeDigits(task.receive_year?.toString().toLowerCase()).includes(token) ||
                normalizeDigits(task.date?.toString().toLowerCase()).includes(token) ||
                normalizeDigits(task.createdAt?.toString().toLowerCase()).includes(token)
            );
        });

        const matchUrgency = urgencyFilter === "" || task.urgency_level === urgencyFilter;
        const matchSecrecy = secrecyFilter === "" || task.secret_level === secrecyFilter;

        return matchStatus && matchPerson && matchSearch && matchUrgency && matchSecrecy;
    }).sort((a, b) => {
        if (a.status === "completed" && b.status !== "completed") return 1;
        if (a.status !== "completed" && b.status === "completed") return -1;
        
        const parseTaskDate = (dateStr: string) => {
            if (!dateStr) return 0;
            const parts = dateStr.split('-');
            let year = parseInt(parts[0], 10);
            
            if (year > 2400) {
                year = year - 543;
            }
            
            const normalizedDateStr = `${year}-${parts[1]}-${parts[2]}`;
            const time = new Date(normalizedDateStr).getTime();
            return isNaN(time) ? 0 : time;
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTime = today.getTime();

        const dateA = parseTaskDate(a.date);
        const dateB = parseTaskDate(b.date);
        
        const diffDaysA = dateA ? Math.ceil((dateA - todayTime) / (1000 * 60 * 60 * 24)) : 9999;
        const diffDaysB = dateB ? Math.ceil((dateB - todayTime) / (1000 * 60 * 60 * 24)) : 9999;

        const isAOverdue = diffDaysA < 0;
        const isBOverdue = diffDaysB < 0;

        if (isAOverdue !== isBOverdue) {
            return isAOverdue ? 1 : -1;
        }

        return dateA - dateB;
    });

    const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);
    const paginatedTasks = filteredTasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="flex flex-col w-full h-full  min-h-[75vh]">
            
            <div className={styles.ContentWrapper}>
                <div className={styles.ContentContainer}>

                    <div className="flex flex-col sm:flex-row justify-between gap-4">

                        <h1 className={styles.Header} style={{ fontSize: "3rem", fontWeight: "bold", margin: "0.75rem" }}>
                            งานติดตามเร่งด่วน
                        </h1>

                        <div className="flex flex-row items-center">
                            <button 
                                onClick={handleReserveTask}
                                className={styles.Button} 
                                style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    minHeight: '48px', 
                                    padding: '0 24px',
                                    margin: '12px 0 12px 16px',
                                    backgroundColor: 'var(--blueBG)',
                                    color: 'var(--blueText)',
                                    border: '1px solid var(--blueText)'
                                }}
                            >
                                📝 จองเลขรับ
                            </button>
                            <Link 
                                href={'/addFile'} 
                                aria-label="ไปหน้าเพิ่มงานติดตามใหม่" 
                                className={styles.Button} 
                                style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    minHeight: '48px', 
                                    padding: '0 24px',
                                    margin: '12px 16px',
                                    textDecoration: 'none'
                                }}
                            >
                                + เพิ่มงานติดตาม
                            </Link>
                        </div>
                    </div>

                    <div className={styles.ContentHeader} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem', marginBottom: '1rem' }} >
                        
                        {/* 🔍 ช่องค้นหาแบบแยกบรรทัด */}
                        <div style={{ width: '100%' }}>
                            <input 
                                type="text" 
                                placeholder="🔍 ค้นหางาน หรือ ผู้รับผิดชอบ..." 
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                style={{ padding: '0.5rem 1rem', borderRadius: '0.4rem', border: '2px solid var(--wrapper)', width: '100%', outline: 'none', backgroundColor: 'var(--button)' }}
                            />
                        </div>

                        {/* 🛠 กล่องตัวกรองต่างๆ เรียงกันในบรรทัดเดียวถ้าพื้นที่พอ */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', width: '100%', alignItems: 'center' }}>
                            <StatusMultiSelect 
                                statusFilter={statusFilter}
                                setStatusFilter={setStatusFilter}
                            />

                            <PersonMultiSelect 
                                uniquePersons={uniquePersons}
                                personFilter={personFilter}
                                setPersonFilter={setPersonFilter}
                            />

                            <select 
                                value={urgencyFilter} 
                                onChange={(e) => setUrgencyFilter(e.target.value)}
                                className={styles.Dropdown}
                            >
                                <option value="">ทั้งหมด (ชั้นความเร็ว)</option>
                                <option value="ด่วน">ด่วน</option>
                                <option value="ด่วนมาก">ด่วนมาก</option>
                                <option value="ด่วนที่สุด">ด่วนที่สุด</option>
                            </select>

                            <select 
                                value={secrecyFilter} 
                                onChange={(e) => setSecrecyFilter(e.target.value)}
                                className={styles.Dropdown}
                            >
                                <option value="">ทั้งหมด (ชั้นความลับ)</option>
                                <option value="ลับ">ลับ</option>
                                <option value="ลับมาก">ลับมาก</option>
                                <option value="ลับที่สุด">ลับที่สุด</option>
                            </select>
                        </div>
                    </div>
                    <hr className={styles.Line}></hr>
                    
                    {isLoading ? (
                        <div className="flex items-center justify-center w-full text-(--foreground)/60 font-bold" style={{ minHeight: '500px' }}>
                            กำลังโหลดข้อมูล...
                        </div>
                    ) : (
                        <>
                            <TaskDisplayer tasks={paginatedTasks} onStatusChange={handleStatusChange} />
                            
                            {totalPages > 0 && (() => {
                                let startPage = Math.max(1, currentPage - 5);
                                let endPage = Math.min(totalPages, currentPage + 5);

                                if (endPage - startPage < 10) {
                                    if (startPage === 1) {
                                        endPage = Math.min(totalPages, startPage + 10);
                                    } else if (endPage === totalPages) {
                                        startPage = Math.max(1, endPage - 10);
                                    }
                                }

                                const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

                                return (
                                    <div className="flex flex-col md:flex-row justify-between items-center p-4 border rounded-sm mt-auto shadow-[0_1px_2px_var(--shadow)] bg-(--container) border-(--wrapper) gap-4">
                                        <span className="text-sm font-medium opacity-70">
                                            หน้า {currentPage} จาก {totalPages}
                                        </span>

                                        <div className="flex items-center gap-1 sm:gap-2">
                                            <button
                                                disabled={currentPage === 1}
                                                onClick={() => setCurrentPage(1)}
                                                className="px-3 py-2 border rounded-sm disabled:opacity-30 text-sm font-medium transition cursor-pointer bg-(--button) border-(--wrapper) hover:bg-[#e5e5e5] text-foreground"
                                                title="หน้าแรกสุด"
                                            >
                                                &laquo;
                                            </button>
                                            <button
                                                disabled={currentPage === 1}
                                                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                                                className="px-3 py-2 border rounded-sm disabled:opacity-30 text-sm font-medium transition cursor-pointer bg-(--button) border-(--wrapper) hover:bg-[#e5e5e5] text-foreground"
                                                title="ก่อนหน้า"
                                            >
                                                &lsaquo;
                                            </button>

                                            <div className="hidden sm:flex items-center gap-1 overflow-x-auto">
                                                {pageNumbers.map((page) => (
                                                    <button
                                                        key={page}
                                                        onClick={() => setCurrentPage(page)}
                                                        className={`px-3 py-2 border rounded-sm text-sm font-medium transition cursor-pointer ${
                                                            page === currentPage
                                                                ? "bg-(--header) text-background font-bold pointer-events-none border-transparent"
                                                                : "bg-(--button) border-(--wrapper) text-foreground hover:bg-[#e5e5e5]"
                                                        }`}
                                                    >
                                                        {page}
                                                    </button>
                                                ))}
                                            </div>

                                            <button
                                                disabled={currentPage === totalPages}
                                                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                                                className="px-3 py-2 border rounded-sm disabled:opacity-30 text-sm font-medium transition cursor-pointer bg-(--button) border-(--wrapper) hover:bg-[#e5e5e5] text-foreground"
                                                title="ถัดไป"
                                            >
                                                &rsaquo;
                                            </button>
                                            <button
                                                disabled={currentPage === totalPages}
                                                onClick={() => setCurrentPage(totalPages)}
                                                className="px-3 py-2 border rounded-sm disabled:opacity-30 text-sm font-medium transition cursor-pointer bg-(--button) border-(--wrapper) hover:bg-[#e5e5e5] text-foreground"
                                                title="หน้าท้ายสุด"
                                            >
                                                &raquo;
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}