"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';

// นำเข้า Components ย่อย
import Header from '@/components/dashboard/Header';
import MetricCards from '@/components/dashboard/MetricCards';
import TaskTable from '@/components/dashboard/TaskTable';
import MonthlyProgressChart from '@/components/dashboard/MonthlyProgressChart';

// นำเข้า Types
import { UserStat, TaskFromAPI, SortKey } from '@/components/dashboard/Types';

function getTaskYearCE(task: TaskFromAPI): number | null {
    if (task.receive_year && Number(task.receive_year) > 0) {
        const rYear = Number(task.receive_year);
        return rYear > 2400 ? rYear - 543 : rYear;
    }
    const dateStr = task.memo_date || task.date || task.createdAt;
    if (dateStr) {
        const match = String(dateStr).match(/^(\d{4})/);
        if (match) {
            let y = parseInt(match[1], 10);
            return y > 2400 ? y - 543 : y;
        }
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            let y = d.getFullYear();
            return y > 2400 ? y - 543 : y;
        }
    }
    return null;
}

function getTaskMonth(task: TaskFromAPI): number | null {
    const dateStr = task.memo_date || task.date || task.createdAt;
    if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            return d.getMonth();
        }
    }
    return null;
}

export default function Dashboard() {
    const [rawTasks, setRawTasks] = useState<TaskFromAPI[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
    const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

    const [sortKey, setSortKey] = useState<SortKey>('userName');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [expandedUser, setExpandedUser] = useState<string | null>(null);

    // 1. ดึงข้อมูลดิบจาก API
    useEffect(() => {
        const fetchDashboardData = async () => {
            const token = localStorage.getItem("token");
            if (!token) {
                window.location.href = '/login';
                return;
            }

            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5003';

            try {
                const response = await fetch(`${backendUrl}/api/v1/tasks`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.status === 401 || response.status === 403) {
                    localStorage.removeItem("token");
                    localStorage.removeItem("user_id");
                    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                    window.location.href = '/login';
                    return;
                }

                if (!response.ok) throw new Error('ไม่สามารถดึงข้อมูลได้');

                const tasksArray: TaskFromAPI[] = await response.json();
                setRawTasks(tasksArray);
            } catch (error) {
                console.error("Dashboard Error:", error);
                Swal.fire({
                    icon: 'error',
                    title: 'เกิดข้อผิดพลาด',
                    text: 'ไม่สามารถดึงข้อมูล Dashboard ได้',
                });
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    // รายชื่อปีทะเบียนทั้งหมดที่มีในข้อมูล
    const availableYears = useMemo(() => {
        const yearsSet = new Set<number>();
        yearsSet.add(new Date().getFullYear());
        rawTasks.forEach(task => {
            const yearCE = getTaskYearCE(task);
            if (yearCE) {
                yearsSet.add(yearCE);
            }
        });
        return Array.from(yearsSet).sort((a, b) => b - a);
    }, [rawTasks]);

    // 2. คำนวณสถิติรายบุคคล (กรองตาม selectedYear และ selectedMonth)
    const stats = useMemo(() => {
        const userStatsObj: Record<string, UserStat> = {};

        rawTasks.forEach(task => {
            const taskYearCE = getTaskYearCE(task);
            const taskMonth = getTaskMonth(task);

            if (selectedYear !== 'all' && taskYearCE !== selectedYear) return;
            if (selectedMonth !== null && taskMonth !== selectedMonth) return;

            const assignees = Array.isArray(task.assigneesData) ? task.assigneesData : [];
            if (assignees.length === 0) {
                assignees.push({ name: 'ไม่ระบุชื่อ', color: '#e5e7eb' });
            }

            assignees.forEach(assignee => {
                const userName = assignee.name || 'ไม่ระบุชื่อ';

                if (!userStatsObj[userName]) {
                    userStatsObj[userName] = {
                        userName: userName,
                        color: assignee.color || '#e5e7eb',
                        totalTasks: 0,
                        completedTasks: 0,
                        incompleteTasks: 0,
                        tasksDetails: []
                    };
                }

                const userStat = userStatsObj[userName];
                userStat.totalTasks += 1;

                const isDone = task.status === 'completed';
                if (isDone) {
                    userStat.completedTasks += 1;
                } else {
                    userStat.incompleteTasks += 1;
                }

                userStat.tasksDetails.push({
                    taskId: task.id,
                    taskName: task.name || 'ไม่ระบุชื่องาน',
                    status: task.status,
                    dueDate: task.date,
                    isUrgent: task.isUrgent
                });
            });
        });

        return Object.values(userStatsObj);
    }, [rawTasks, selectedYear, selectedMonth]);

    // 3. คำนวณ Metric ภาพรวม
    const globalMetrics = useMemo(() => {
        let total = 0;
        let completed = 0;
        stats.forEach(u => {
            total += u.totalTasks;
            completed += u.completedTasks;
        });
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { total, completed, rate, totalPeople: stats.length };
    }, [stats]);

    // หาค่า Max สำหรับเปรียบเทียบ Scale Progress bar
    const maxTasks = useMemo(() => {
        if (stats.length === 0) return 1;
        return Math.max(...stats.map(u => u.totalTasks));
    }, [stats]);

    // 4. การจัดเรียงลำดับ (Sorting Logic)
    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortOrder(key === 'userName' ? 'asc' : 'desc');
        }
    };

    const sortedStats = useMemo(() => {
        return [...stats].sort((a, b) => {
            if (a[sortKey] < b[sortKey]) return sortOrder === 'asc' ? -1 : 1;
            if (a[sortKey] > b[sortKey]) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [stats, sortKey, sortOrder]);

    const toggleExpand = (userName: string) => {
        setExpandedUser(expandedUser === userName ? null : userName);
    };

    if (loading) {
        return (
            <div className="p-12 text-center text-foreground font-semibold text-lg animate-pulse">
                กำลังโหลดข้อมูลและประมวลผลระบบแดชบอร์ด...
            </div>
        );
    }

    return (
        <div className='w-full bg-(--wrapper)'>
        <div className="w-full max-w-7xl mx-auto px-4 py-8 flex flex-col gap-6 ">
            <Header />
            
            <MetricCards metrics={globalMetrics} />
            
            {/* กราฟความก้าวหน้ารายเดือน */}
            <MonthlyProgressChart 
                rawTasks={rawTasks}
                selectedYear={selectedYear}
                setSelectedYear={setSelectedYear}
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                availableYears={availableYears}
            />

            <TaskTable 
                stats={sortedStats}
                sortKey={sortKey}
                sortOrder={sortOrder}
                onSort={handleSort}
                expandedUser={expandedUser}
                onToggleExpand={toggleExpand}
                maxTasks={maxTasks}
            />
        </div>
        </div>
    );
}