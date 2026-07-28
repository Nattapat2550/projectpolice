"use client";

import React, { useId } from "react";

interface CreatableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

export const CreatableCombobox: React.FC<CreatableComboboxProps> = ({
  value,
  onChange,
  options,
  placeholder = "พิมพ์หรือเลือกจากรายการ...",
  className = "",
}) => {
  const listId = useId();
  const uniqueOptions = Array.from(new Set(options)).filter(Boolean);

  return (
    <div className={`w-full ${className}`}>
      <input
        type="text"
        list={listId}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 px-3 rounded-md outline-none text-sm font-medium border border-(--shadow) bg-(--button) text-(--foreground) focus:ring-2 focus:ring-blue-500 transition"
      />
      <datalist id={listId}>
        {uniqueOptions.map((opt, i) => (
          <option key={i} value={opt} />
        ))}
      </datalist>
    </div>
  );
};
