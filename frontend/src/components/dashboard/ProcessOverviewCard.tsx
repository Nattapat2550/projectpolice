"use client";

import React from 'react';
import { FileUp, Cpu, Hourglass, CheckCircle2, ArrowRight, Layers } from 'lucide-react';
import { TaskFromAPI } from './Types';

interface ProcessOverviewCardProps {
    rawTasks: TaskFromAPI[];
}

export default function ProcessOverviewCard({ rawTasks }: ProcessOverviewCardProps) {
    const totalTasks = rawTasks.length;
    const completedTasks = rawTasks.filter(t => t.status === 'completed').length;
    const followingTasks = totalTasks - completedTasks;
    const urgentTasks = rawTasks.filter(t => t.isUrgent).length;

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const stages = [
        {
            step: 1,
            title: "นำเข้าเอกสาร",
            subtitle: "Document Import",
            icon: FileUp,
            color: "text-blue-500",
            bg: "bg-blue-500/10 border-blue-500/30",
            stat: `${totalTasks} ฉบับ`,
            desc: "อัปโหลด PDF/สแกน หรือคีย์ด้วยตนเอง"
        },
        {
            step: 2,
            title: "AI สกัด & มอบหมาย",
            subtitle: "AI Extraction & Assign",
            icon: Cpu,
            color: "text-purple-500",
            bg: "bg-purple-500/10 border-purple-500/30",
            stat: "ประมวลผล 100%",
            desc: "Gemini / OCR สกัดข้อความและกำหนดผู้รับผิดชอบ"
        },
        {
            step: 3,
            title: "อยู่ระหว่างติดตาม",
            subtitle: "Active Tracking",
            icon: Hourglass,
            color: "text-amber-500",
            bg: "bg-amber-500/10 border-amber-500/30",
            stat: `${followingTasks} งาน`,
            desc: `มีงานเร่งด่วน ${urgentTasks} รายการ`
        },
        {
            step: 4,
            title: "ดำเนินการเสร็จสิ้น",
            subtitle: "Completed Tasks",
            icon: CheckCircle2,
            color: "text-emerald-500",
            bg: "bg-emerald-500/10 border-emerald-500/30",
            stat: `${completedTasks} งาน (${completionRate}%)`,
            desc: "ลงนามและส่งแบบตอบรับสำเร็จเรียบร้อย"
        }
    ];

    return (
        <div className="bg-(--container) border-2 border-(--wrapper) rounded-2xl p-6 shadow-sm flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-(--wrapper) pb-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
                        <Layers className="text-(--blueText) w-6 h-6" />
                        ภาพรวมวงจรขั้นตอนการทำงาน (Overall Organizational Workflow Process)
                    </h2>
                    <p className="text-xs text-foreground/70 mt-1">
                        แสดงสถานะของระบบตั้งแต่การรับเอกสารจนถึงการปิดติดตามงานอย่างครบวงจร
                    </p>
                </div>

                <div className="flex items-center gap-2 bg-(--button) px-3 py-1.5 rounded-xl border border-(--wrapper)">
                    <span className="text-xs font-bold text-foreground">ความสำเร็จองค์รวม:</span>
                    <span className="text-sm font-extrabold text-emerald-600">{completionRate}%</span>
                </div>
            </div>

            {/* Workflow Pipeline */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
                {stages.map((st, idx) => {
                    const IconComp = st.icon;
                    return (
                        <div key={idx} className="relative flex flex-col justify-between p-4 rounded-xl border bg-(--button) hover:shadow-md transition-all">
                            {/* Step Badge */}
                            <div className="flex items-center justify-between mb-3">
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${st.bg} ${st.color}`}>
                                    0{st.step}
                                </span>
                                <IconComp className={`w-6 h-6 ${st.color}`} />
                            </div>

                            {/* Info */}
                            <div>
                                <h3 className="font-bold text-sm text-foreground">{st.title}</h3>
                                <p className="text-[10px] text-foreground/60">{st.subtitle}</p>
                                
                                <div className="my-3 py-1.5 px-2.5 rounded-lg bg-(--container) border border-(--wrapper) font-extrabold text-xs text-foreground">
                                    {st.stat}
                                </div>
                                <p className="text-xs text-foreground/70">{st.desc}</p>
                            </div>

                            {/* Connector Arrow for Desktop */}
                            {idx < stages.length - 1 && (
                                <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-gray-400 bg-(--container) rounded-full p-1 border border-(--wrapper)">
                                    <ArrowRight size={14} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
