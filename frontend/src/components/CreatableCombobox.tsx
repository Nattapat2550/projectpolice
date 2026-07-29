"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";

interface CreatableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const CreatableCombobox: React.FC<CreatableComboboxProps> = ({
  value,
  onChange,
  options = [],
  placeholder = "พิมพ์หรือเลือกจากรายการ...",
  className = "",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // กรองรายการที่ไม่ซ้ำ
  const uniqueOptions = useMemo(() => {
    const set = new Set<string>();
    const result: string[] = [];
    for (const opt of options || []) {
      if (opt && typeof opt === "string") {
        const trimmed = opt.trim();
        if (trimmed && !set.has(trimmed)) {
          set.add(trimmed);
          result.push(trimmed);
        }
      }
    }
    return result;
  }, [options]);

  // กรองตามคำที่กำลังพิมพ์
  const filteredOptions = useMemo(() => {
    const search = (value || "").trim().toLowerCase();
    if (!search) return uniqueOptions;
    return uniqueOptions.filter((opt) => opt.toLowerCase().includes(search));
  }, [uniqueOptions, value]);

  // ปิดเมื่อคลิกข้างนอก
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectOption = (opt: string) => {
    onChange(opt);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        return;
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1 < filteredOptions.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === "Enter") {
      if (isOpen && highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
        e.preventDefault();
        handleSelectOption(filteredOptions[highlightIndex]);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={value || ""}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setHighlightIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full rounded-lg border border-(--shadow) bg-(--button) px-3 py-2.5 text-base outline-none transition focus:border-(--header) focus:ring-2 focus:ring-(--header)/20 text-(--foreground)"
      />

      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-md border border-zinc-400 bg-white shadow-md py-0.5 text-base">
          {filteredOptions.map((opt, i) => {
            const isHighlighted = i === highlightIndex;
            return (
              <div
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectOption(opt);
                }}
                onMouseEnter={() => setHighlightIndex(i)}
                className={`px-3 py-1.5 cursor-pointer text-black transition-colors ${
                  isHighlighted ? "bg-[#0066cc] text-white font-medium" : "hover:bg-[#0066cc] hover:text-white"
                }`}
              >
                {opt}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
