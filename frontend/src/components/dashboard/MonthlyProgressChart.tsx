"use client";

import React from 'react';
import { TrendingUp, Filter, RotateCcw } from 'lucide-react';
import { TaskFromAPI } from './Types';

interface MonthlyProgressChartProps {
    rawTasks: TaskFromAPI[];
    selectedYear: number | 'all';
    setSelectedYear: (year: number | 'all') => void;
    selectedMonth: number | null;
    setSelectedMonth: (monthIndex: number | null) => void;
    availableYears: number[];
}

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

export default function MonthlyProgressChart({
    rawTasks,
    selectedYear,
    setSelectedYear,
    selectedMonth,
    setSelectedMonth,
    availableYears
}: MonthlyProgressChartProps) {
    const thaiMonths = [
        'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];

    // Compute monthly stats filtered by selectedYear
    const monthlyStats = thaiMonths.map((monthName, monthIndex) => {
        let total = 0;
        let completed = 0;
        let following = 0;

        rawTasks.forEach(task => {
            const taskYearCE = getTaskYearCE(task);
            const taskMonth = getTaskMonth(task);

            if (selectedYear !== 'all' && taskYearCE !== selectedYear) return;

            if (taskMonth === monthIndex) {
                total += 1;
                if (task.status === 'completed') {
                    completed += 1;
                } else {
                    following += 1;
                }
            }
        });

        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        return {
            month: monthName,
            monthIndex,
            total,
            completed,
            following,
            rate
        };
    });

    const maxCount = Math.max(...monthlyStats.map(m => m.total), 5);

    return (
        <div className="bg-(--container) border-2 border-(--wrapper) rounded-2xl p-6 shadow-sm flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-(--wrapper) pb-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
                        <TrendingUp className="text-(--blueText) w-6 h-6" />
                        ความก้าวหน้าและปริมาณงานรายเดือน (Monthly Task Progress)
                    </h2>
                    <p className="text-xs text-foreground/70 mt-1">
                        คลิกที่แท่งกราฟของเดือนใดก็ได้เพื่อกรองตารางภาระงานรายบุคคล
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                    {/* Year Selector Dropdown */}
                    <div className="flex items-center gap-2 bg-(--button) px-3 py-1.5 rounded-xl border border-(--wrapper) shadow-xs">
                        <label htmlFor="yearSelect" className="text-foreground/80 font-bold whitespace-nowrap">ปี พ.ศ. :</label>
                        <select 
                            id="yearSelect"
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                            className="bg-transparent font-bold text-(--blueText) outline-none cursor-pointer"
                        >
                            <option value="all" className="bg-(--container) text-foreground font-semibold">ทุกปี</option>
                            {availableYears.map(y => (
                                <option key={y} value={y} className="bg-(--container) text-foreground font-semibold">พ.ศ. {y + 543} ({y})</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-(--blueText) inline-block"></span>
                        <span className="text-foreground/80">งานทั้งหมด</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                        <span className="text-foreground/80">เสร็จสิ้น</span>
                    </div>
                </div>
            </div>

            {/* Active Month Filter Indicator & Reset Button */}
            {selectedMonth !== null && (
                <div className="flex items-center justify-between bg-(--blueText)/10 border border-(--blueText)/30 px-4 py-2.5 rounded-xl text-xs">
                    <span className="flex items-center gap-2 font-bold text-(--blueText)">
                        <Filter size={15} />
                        แสดงข้อมูลเฉพาะเดือน: <span className="underline font-extrabold text-sm">{thaiMonths[selectedMonth]}</span>
                    </span>
                    <button 
                        onClick={() => setSelectedMonth(null)}
                        className="flex items-center gap-1 bg-(--button) hover:bg-red-500/10 text-red-500 px-3 py-1 rounded-lg font-bold border border-red-300/40 transition-colors cursor-pointer select-none"
                    >
                        <RotateCcw size={13} /> ล้างการกรอง (แสดงทุกเดือน)
                    </button>
                </div>
            )}

            {/* Bar Chart Visual */}
            <div className="w-full overflow-x-auto sm:overflow-visible">
                <div className="w-full min-w-[480px] sm:min-w-0 h-64 flex items-end gap-1.5 sm:gap-3 pt-8 pb-2 px-1 border-b border-gray-300/40">
                    {monthlyStats.map((item, idx) => {
                        const isSelected = selectedMonth === item.monthIndex;
                        const totalHeightPct = (item.total / maxCount) * 100;
                        const completedHeightPct = item.total > 0 ? (item.completed / item.total) * 100 : 0;

                        return (
                            <div 
                                key={idx} 
                                onClick={() => setSelectedMonth(isSelected ? null : item.monthIndex)}
                                className={`flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer p-1 rounded-t-xl transition-all ${
                                    isSelected ? 'bg-(--blueText)/15 ring-2 ring-(--blueText)' : 'hover:bg-gray-500/5'
                                }`}
                            >
                                {/* Tooltip on Hover */}
                                <div className="absolute -top-16 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded-lg p-2.5 shadow-xl pointer-events-none z-20 whitespace-nowrap border border-gray-700">
                                    <p className="font-bold border-b border-gray-700 pb-1 mb-1">เดือน {item.month} (คลิกเพื่อกรอง)</p>
                                    <div className="flex justify-between gap-3"><span>งานทั้งหมด:</span> <span className="font-semibold">{item.total} งาน</span></div>
                                    <div className="flex justify-between gap-3 text-emerald-400"><span>เสร็จสิ้น:</span> <span className="font-semibold">{item.completed} งาน</span></div>
                                    <div className="flex justify-between gap-3 text-amber-400"><span>กำลังติดตาม:</span> <span className="font-semibold">{item.following} งาน</span></div>
                                    <div className="flex justify-between gap-3 text-blue-300 font-bold border-t border-gray-700 pt-1 mt-1"><span>ความสำเร็จ:</span> <span>{item.rate}%</span></div>
                                </div>

                                {/* Percentage Badge above Bar */}
                                {item.total > 0 && (
                                    <span className={`text-[10px] font-bold mb-1 ${isSelected ? 'text-(--blueText) underline font-extrabold' : 'text-emerald-600'}`}>
                                        {item.rate}%
                                    </span>
                                )}

                                {/* Outer Bar Container */}
                                <div className={`w-full max-w-[36px] rounded-t-lg relative overflow-hidden transition-all flex flex-col justify-end ${
                                    isSelected ? 'ring-2 ring-(--blueText) shadow-md' : 'bg-gray-200/60 group-hover:brightness-105'
                                }`} style={{ height: `${Math.max(totalHeightPct, 6)}%` }}>
                                    {/* Total Background Portion */}
                                    <div className="w-full bg-(--blueText)/40 h-full relative">
                                        {/* Completed Fill Portion */}
                                        <div 
                                            className="w-full bg-emerald-500 rounded-t-sm transition-all duration-500 absolute bottom-0 left-0" 
                                            style={{ height: `${completedHeightPct}%` }}
                                        />
                                    </div>
                                </div>

                                {/* X Axis Label */}
                                <span className={`text-[11px] sm:text-xs font-semibold mt-2 transition-colors ${
                                    isSelected ? 'text-(--blueText) font-extrabold underline' : 'text-foreground/80 group-hover:text-(--blueText)'
                                }`}>
                                    {item.month}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
