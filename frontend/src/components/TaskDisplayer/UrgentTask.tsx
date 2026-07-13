"use client";

import { useState, useEffect } from "react";
import TaskDisplayer from "./TaskDisplayer";
import styles from "./TaskDisplayer.module.css";
import PersonMultiSelect from "./PersonMultiSelect";
import StatusMultiSelect from "./StatusMultiSelect"; // 👈 Imported the multi-select component
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

type TaskStatus = "following" | "problem" | "completed";

// 💡 Global Cache แบบเดียวกับ Project Follow
const urgentTaskFetchCache = new Map<string, any[]>();

export default function UrgentTask() {
    const initialTaskData = [
        { 
            id: "0", 
            name: "ชื่องานด่วนมาก", 
            personInCharge: "ผู้ดูแลระบบ", 
            date: "2026-05-21", 
            status: "following",
            createdAt: new Date().toISOString(),
            assigneesData: [{ name: "ผู้ดูแลระบบ", color: "#fca5a5" }] 
        },
    ];

    const [tasks, setTasks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // 💡 Changed from string "all" to string[] to support multi-select status filtering
    const [statusFilter, setStatusFilter] = useState<string[]>([]); 
    const [personFilter, setPersonFilter] = useState<string[]>([]); 

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        setCurrentPage(1);
    }, [statusFilter, personFilter]);

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
            const response = await fetch(`${backendUrl}/api/v1/tasks/${id}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
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
            alert("เกิดข้อผิดพลาด ไม่สามารถอัปเดตสถานะได้");
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

        return matchStatus && matchPerson;
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

        const dateA = parseTaskDate(a.date);
        const dateB = parseTaskDate(b.date);
        return dateA - dateB;
    });

    const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);
    const paginatedTasks = filteredTasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="flex flex-col w-full h-full  min-h-[75vh]">
            
            <div className={styles.ContentWrapper}>
                <div className={styles.ContentContainer}>

                    <h1 className={styles.Header} style={{ fontSize: "3rem", fontWeight: "bold", margin: "0.75rem" }}>
                        งานติดตามเร่งด่วน
                    </h1>

                    <div className={styles.ContentHeader} >
                        
                        {/* 💡 Replaced legacy dropdown with custom multi-select selector */}
                        <StatusMultiSelect 
                            statusFilter={statusFilter}
                            setStatusFilter={setStatusFilter}
                        />

                        <PersonMultiSelect 
                            uniquePersons={uniquePersons}
                            personFilter={personFilter}
                            setPersonFilter={setPersonFilter}
                        />
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