"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./TaskDisplayer.module.css"; 

type PersonMultiSelectProps = {
    uniquePersons: string[];
    personFilter: string[];
    setPersonFilter: React.Dispatch<React.SetStateAction<string[]>>;
};

export default function PersonMultiSelect({
    uniquePersons,
    personFilter,
    setPersonFilter
}: PersonMultiSelectProps) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [dbUsers, setDbUsers] = useState<string[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchAllUsers = async () => {
            try {
                const token = typeof window !== 'undefined' ? localStorage.getItem("token") : "";
                const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
                const res = await fetch(`${backendUrl}/api/v1/users`, {
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { "Authorization": `Bearer ${token}` } : {})
                    }
                });
                if (res.ok) {
                    const result = await res.json();
                    if (result.success && result.data) {
                        setDbUsers(result.data.map((u: any) => u.name));
                    }
                }
            } catch (err) {
                console.error("Failed to fetch all users for dropdown", err);
            }
        };
        fetchAllUsers();
    }, []);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handlePersonToggle = (person: string) => {
        setPersonFilter((prev) =>
            prev.includes(person)
                ? prev.filter((p) => p !== person)
                : [...prev, person]
        );
    };

    const allDisplayPersons = Array.from(new Set([...uniquePersons, ...dbUsers, 'ไม่ระบุ']));

    return (
        <div className={styles.FilterGroup} ref={dropdownRef}>
            <strong>แสดงสำหรับ:</strong>
            <div className={styles.MultiSelectContainer}>
                <div 
                    className={styles.MultiSelectTrigger} 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                    <span className={styles.TriggerText}>
                        {personFilter.length === 0 
                            ? "ทุกคน" 
                            : `เลือกแล้ว (${personFilter.length} คน): ${personFilter.join(', ')}`}
                    </span>
                    
                    {/* 💡 บังคับลูกศรให้ขนาด 16px และสีเดียวกับกล่อง สถานะ ทุกกระเบียดนิ้ว */}
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
                                d="M4.516 7.548c0.436-0.446 1.043-0.481 1.576 0l3.908 3.747 3.908-3.747c0.533-0.481 1.141-0.446 1.574 0 0.436 0.445 0.408 1.197 0 1.615-0.406 0.418-4.695 4.502-4.695 4.502-0.217 0.223-0.502 0.335-0.787 0.335s-0.57-0.112-0.789-0.335c0 0-4.287-4.084-4.695-4.502s-0.436-1.17 0-1.615z"
                            ></path>
                        </svg>
                    </div>
                </div>

                {isDropdownOpen && (
                    <div className={styles.MultiSelectMenu}>
                        {personFilter.length > 0 && (
                            <div 
                                onClick={() => setPersonFilter([])}
                                className={styles.ClearAllButton}
                            >
                                ✕ ล้างทั้งหมด (เลือกทุกคน)
                            </div>
                        )}
                        {allDisplayPersons.map((person, idx) => {
                            const isChecked = personFilter.includes(person);
                            return (
                                <div 
                                    key={idx} 
                                    className={styles.CheckboxOption}
                                    style={{ backgroundColor: isChecked ? 'var(--greenBG, #e6f7ff)' : 'transparent' }}
                                    onClick={() => handlePersonToggle(person)}
                                >
                                    <input 
                                        type="checkbox" 
                                        checked={isChecked}
                                        readOnly
                                        className={styles.CheckboxInput}
                                        style={{ pointerEvents: 'none' }}
                                    />
                                    <span>{person}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}