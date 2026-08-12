"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./TaskDisplayer.module.css"; 

type StatusMultiSelectProps = {
    statusFilter: string[];
    setStatusFilter: React.Dispatch<React.SetStateAction<string[]>>;
};

export default function StatusMultiSelect({
    statusFilter,
    setStatusFilter
}: StatusMultiSelectProps) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Explicitly define statuses with labels for presentation
    const availableStatuses = [
        { value: "following", label: "กำลังติดตาม" },
        { value: "problem", label: "ติดปัญหา" },
        { value: "completed", label: "เสร็จสิ้น" }
    ];

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleStatusToggle = (statusValue: string) => {
        setStatusFilter((prev) =>
            prev.includes(statusValue)
                ? prev.filter((s) => s !== statusValue)
                : [...prev, statusValue]
        );
    };

    // Helper to render active badges/text in input trigger
    const getTriggerText = () => {
        if (statusFilter.length === 0) return "ทั้งหมด";
        
        return `เลือกแล้ว (${statusFilter.length}): ${
            availableStatuses
                .filter(s => statusFilter.includes(s.value))
                .map(s => s.label)
                .join(', ')
        }`;
    };

    return (
        <div className={styles.FilterGroup} ref={dropdownRef}>
            <strong>สถานะ:</strong>
            <div className={styles.MultiSelectContainer}>
                <div 
                    className={styles.MultiSelectTrigger} 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                    <span className={styles.TriggerText}>
                        {getTriggerText()}
                    </span>
                    
                    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: '8px' }}>
                        <svg 
                            height="16" 
                            width="16" 
                            viewBox="0 0 20 20" 
                            aria-hidden="true" 
                            focusable="false"
                            style={{ 
                                transform: isDropdownOpen ? 'rotate(180deg)' : 'none',
                                transition: 'transform 0.2s ease',
                                color: '#6b7280', 
                            }}
                        >
                            <path 
                                fill="currentColor" 
                                d="M4.516 7.548c0.436-0.446 1.043-0.481 1.576 0 l3.908 3.747 3.908-3.747c0.533-0.481 1.141-0.446 1.574 0 0.436 0.445 0.408 1.197 0 1.615-0.406 0.418-4.695 4.502-4.695 4.502-0.217 0.223-0.502 0.335-0.787 0.335s-0.57-0.112-0.789-0.335c0 0-4.287-4.084-4.695-4.502s-0.436-1.17 0-1.615z"
                            ></path>
                        </svg>
                    </div>
                </div>

                {isDropdownOpen && (
                    <div className={styles.MultiSelectMenu}>
                        {statusFilter.length > 0 && (
                            <div 
                                onClick={() => setStatusFilter([])}
                                className={styles.ClearAllButton}
                            >
                                ✕ ล้างทั้งหมด (เลือกทั้งหมด)
                            </div>
                        )}
                        {availableStatuses.map((statusItem, idx) => {
                            const isChecked = statusFilter.includes(statusItem.value);
                            return (
                                <div 
                                    key={idx} 
                                    className={styles.CheckboxOption}
                                    style={{ backgroundColor: isChecked ? 'var(--greenBG, #e6f7ff)' : 'transparent' }}
                                    onClick={() => handleStatusToggle(statusItem.value)}
                                >
                                    <input 
                                        type="checkbox" 
                                        checked={isChecked}
                                        readOnly
                                        className={styles.CheckboxInput}
                                        style={{ pointerEvents: 'none' }}
                                    />
                                    <span>{statusItem.label}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}