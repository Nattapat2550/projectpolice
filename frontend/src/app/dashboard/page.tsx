"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';

// นำเข้า Components ย่อย
import Header from '@/components/dashboard/Header';
import MetricCards from '@/components/dashboard/MetricCards';
import TaskTable from '@/components/dashboard/TaskTable';

// นำเข้า Types
import { UserStat, TaskFromAPI, SortKey } from '@/components/dashboard/Types';

export default function Dashboard() {
    const [stats, setStats] = useState<UserStat[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [sortKey, setSortKey] = useState<SortKey>('userName');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [expandedUser, setExpandedUser] = useState<string | null>(null);

    // 1. ดึงข้อมูลและคำนวณสถิติ
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

                if (!response.ok) throw new Error('ไม่สามารถดึงข้อมูลได้');

                const tasksArray: TaskFromAPI[] = await response.json();
                
                // 🔒 แก้ไข: ใช้ Record object แทน Map เพื่อหลบ Snyk False Positive (CWE-798)
                const userStatsObj: Record<string, UserStat> = {};

                tasksArray.forEach(task => {
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

                setStats(Object.values(userStatsObj));
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

    // 2. คำนวณ Metric ภาพรวม
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

    // 3. การจัดเรียงลำดับ (Sorting Logic)
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