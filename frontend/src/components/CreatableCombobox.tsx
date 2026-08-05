"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, X, Check } from "lucide-react";

interface CreatableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  isError?: boolean;
  style?: React.CSSProperties;
}

export const CreatableCombobox: React.FC<CreatableComboboxProps> = ({
  value,
  onChange,
  options = [],
  placeholder = "พิมพ์หรือเลือกจากรายการ...",
  className = "",
  disabled = false,
  isError = false,
  style = {},
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
    const normalizeDigits = (str: string) => str.replace(/[๐-๙]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0e50 + 48));
    const normSearch = normalizeDigits(search);
    return uniqueOptions.filter((opt) => normalizeDigits(opt.toLowerCase()).includes(normSearch));
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

  const hasExactMatch = useMemo(() => {
    if (!value || !value.trim()) return true;
    return uniqueOptions.some((opt) => opt.toLowerCase() === value.trim().toLowerCase());
  }, [uniqueOptions, value]);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative flex items-center w-full">
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
          className="w-full rounded-md pl-3 pr-16 py-2.5 text-sm font-medium outline-none transition h-11 placeholder:text-gray-400"
          style={{
            border: isError ? "2px solid #ef4444" : "1px solid var(--wrapper)",
            backgroundColor: isError ? "rgba(239, 68, 68, 0.05)" : "var(--button)",
            color: "var(--foreground)",
            ...style,
          }}
        />

        <div className="absolute right-2.5 flex items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                onChange("");
                setIsOpen(true);
                if (inputRef.current) inputRef.current.focus();
              }}
              className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200/50 transition-colors cursor-pointer"
              title="ล้างข้อความ"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                setIsOpen(!isOpen);
                if (!isOpen && inputRef.current) {
                  inputRef.current.focus();
                }
              }
            }}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {isOpen && (filteredOptions.length > 0 || (value && !hasExactMatch)) && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 max-h-60 overflow-y-auto rounded-lg border border-(--wrapper) bg-(--container) shadow-xl py-1.5 text-sm text-(--foreground) backdrop-blur-sm">
          {filteredOptions.map((opt, i) => {
            const isHighlighted = i === highlightIndex;
            const isSelected = value?.trim().toLowerCase() === opt.toLowerCase();

            return (
              <div
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectOption(opt);
                }}
                onMouseEnter={() => setHighlightIndex(i)}
                className={`px-3.5 py-2 cursor-pointer flex items-center justify-between transition-colors ${
                  isHighlighted
                    ? "bg-[#0066cc] text-white font-medium"
                    : isSelected
                    ? "bg-[#0066cc]/10 text-[#0066cc] font-semibold"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800 opacity-90 hover:opacity-100"
                }`}
              >
                <span>{opt}</span>
                {isSelected && <Check className="w-4 h-4 ml-2 shrink-0 opacity-80" />}
              </div>
            );
          })}

          {value && !hasExactMatch && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsOpen(false);
              }}
              className="px-3.5 py-2 text-xs italic text-gray-500 border-t border-(--wrapper)/50 bg-gray-50/50 dark:bg-gray-900/30 flex items-center gap-1.5"
            >
              <span>✍️ พิมพ์ข้อความใหม่:</span>
              <span className="font-semibold text-(--foreground) not-italic">&quot;{value}&quot;</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
