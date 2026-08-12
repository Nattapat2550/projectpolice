import React, { useState } from 'react';

// 💡 อัปเดต Interface ให้ครอบคลุมฟิลด์ที่มีจริงใน DB (tasks table)
export interface SearchFilters {
  title: string;
  receive_no: string;
  receive_year: string;
  memo_no: string;
  sender: string;
  recipient_to: string;
  additional_docs: string;
  status: string;
  urgency_level: string;
  secret_level: string;
  assignees: string[]; // เก็บเป็น user_id ของผู้รับผิดชอบที่เลือก (เลือกได้หลายคน)
}

export const emptyFilters: SearchFilters = {
  title: '',
  receive_no: '',
  receive_year: '',
  memo_no: '',
  sender: '',
  recipient_to: '',
  additional_docs: '',
  status: '',
  urgency_level: '',
  secret_level: '',
  assignees: [],
};

export interface UserOption {
  id: string;
  name: string;
  color?: string;
}

interface HeaderProps {
  filters: SearchFilters;
  setFilters: React.Dispatch<React.SetStateAction<SearchFilters>>;
  users?: UserOption[];
}

// ค่าตาม ENUM จริงของ DB (ดู db.sql / be.md)
const URGENCY_OPTIONS = ['ปกติ', 'ด่วน', 'ด่วนมาก', 'ด่วนที่สุด'];
const SECRET_OPTIONS = ['ปกติ', 'ลับ', 'ลับมาก', 'ลับที่สุด'];
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'following', label: 'กำลังติดตาม' },
  { value: 'problem', label: 'ติดปัญหา' },
  { value: 'completed', label: 'เสร็จสิ้น' },
];

export const normalizeDigits = (str?: string | null): string => {
  if (!str) return '';
  return str.replace(/[๐-๙]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0e50 + 48));
};

const selectClass =
  'w-full px-4 py-2.5 text-sm rounded-xl bg-[var(--wrapper)]/40 border border-[var(--shadow)]/40 focus:bg-[var(--background)] focus:ring-2 focus:ring-[var(--blueText)]/50 focus:border-transparent outline-none transition-all appearance-none cursor-pointer';

const inputClass =
  'w-full px-4 py-2.5 text-sm rounded-xl bg-[var(--wrapper)]/40 border border-[var(--shadow)]/40 focus:bg-[var(--background)] focus:ring-2 focus:ring-[var(--blueText)]/50 focus:border-transparent outline-none transition-all';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]/60';

export const Header: React.FC<HeaderProps> = ({ filters, setFilters, users = [] }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssigneeOpen, setIsAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');

  const handleClear = () => {
    setFilters({ ...emptyFilters });
  };

  const toggleAssignee = (id: string) => {
    setFilters((prev) => {
      const exists = prev.assignees.includes(id);
      return {
        ...prev,
        assignees: exists
          ? prev.assignees.filter((a) => a !== id)
          : [...prev.assignees, id],
      };
    });
  };

  const removeAssignee = (id: string) => {
    setFilters((prev) => ({ ...prev, assignees: prev.assignees.filter((a) => a !== id) }));
  };

  const selectedUsers = users.filter((u) => filters.assignees.includes(u.id));
  const filteredUserOptions = users.filter((u) =>
    normalizeDigits(u.name.toLowerCase()).includes(normalizeDigits(assigneeSearch.trim().toLowerCase()))
  );

  const isFiltering = Object.values(filters).some((v) =>
    Array.isArray(v) ? v.length > 0 : v && v.trim() !== ''
  );

  return (
    <>
      <div className="pt-6 px-4 sm:px-6 md:px-8 flex flex-1 w-full max-w-[1920px] mx-auto">
        <button
          onClick={() => setIsModalOpen(true)}
          className="relative flex items-center w-full gap-2 px-5 py-2.5 text-sm font-medium rounded-full bg-[var(--container)] border border-[var(--shadow)]/80 border-2 hover:shadow-md hover:border-[var(--blueText)]/50 focus:outline-none active:scale-95 transition-all cursor-pointer select-none"
        >
          <svg className="w-4 h-4 text-[var(--foreground)]/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-[var(--foreground)]/80">
            {isFiltering ? 'แก้ไขตัวกรองค้นหา' : 'ค้นหาข้อมูล...'}
          </span>

          {isFiltering && (
            <span className="absolute top-0 right-0 w-3 h-3 bg-[var(--redBG)] border-2 border-[var(--background)] rounded-full -mt-0.5 -mr-0.5"></span>
          )}
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer"
            onClick={() => setIsModalOpen(false)}
          ></div>

          <div className="relative bg-[var(--container)] w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl shadow-2xl border border-[var(--shadow)]/30 overflow-hidden flex flex-col slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 transition-all duration-300 max-h-[90vh]">

            <div className="px-6 py-4 border-b border-[var(--shadow)]/20 flex justify-between items-center bg-[var(--header-bg)]/5">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">ค้นหาข้อมูล</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full bg-[var(--wrapper)]/80 text-[var(--foreground)]/60 hover:text-[var(--redText)] transition-colors cursor-pointer select-none"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="space-y-1.5">
                <label className={labelClass}>ชื่อเรื่อง / รายละเอียด</label>
                <input
                  type="text"
                  placeholder="เช่น ขออนุมัติโครงการ..."
                  className={inputClass}
                  value={filters.title}
                  onChange={(e) => setFilters({ ...filters, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className={labelClass}>เลขที่หนังสือ</label>
                  <input
                    type="text"
                    placeholder="เช่น ตช 0001/25"
                    className={inputClass}
                    value={filters.memo_no}
                    onChange={(e) => setFilters({ ...filters, memo_no: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>จากหน่วยงาน (ผู้ส่ง)</label>
                  <input
                    type="text"
                    placeholder="เช่น กองกำกับการ 1..."
                    className={inputClass}
                    value={filters.sender}
                    onChange={(e) => setFilters({ ...filters, sender: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className={labelClass}>ถึง (ผู้รับ / เรียน)</label>
                  <input
                    type="text"
                    placeholder="เช่น ผบ.ตช. ..."
                    className={inputClass}
                    value={filters.recipient_to}
                    onChange={(e) => setFilters({ ...filters, recipient_to: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>เอกสารข้อมูลเพิ่มเติม</label>
                  <input
                    type="text"
                    placeholder="เช่น สิ่งที่ส่งมาด้วย..."
                    className={inputClass}
                    value={filters.additional_docs}
                    onChange={(e) => setFilters({ ...filters, additional_docs: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className={labelClass}>เลขรับ</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="เช่น 843"
                    className={inputClass}
                    value={filters.receive_no}
                    onChange={(e) => setFilters({ ...filters, receive_no: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>ปี (พ.ศ.)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="เช่น 2568"
                    className={inputClass}
                    value={filters.receive_year}
                    onChange={(e) => setFilters({ ...filters, receive_year: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5 relative">
                <label className={labelClass}>
                  ผู้รับผิดชอบ <span className="normal-case font-normal text-[var(--foreground)]/40">(เลือกได้หลายคน — ต้องมีครบทุกคนที่เลือก)</span>
                </label>

                <button
                  type="button"
                  onClick={() => setIsAssigneeOpen((v) => !v)}
                  className={`${selectClass} flex items-center justify-between text-left cursor-pointer select-none`}
                >
                  <span className={selectedUsers.length ? 'text-[var(--foreground)]' : 'text-[var(--foreground)]/50'}>
                    {selectedUsers.length > 0 ? `เลือกแล้ว ${selectedUsers.length} คน` : 'ทั้งหมด'}
                  </span>
                  <svg className={`w-4 h-4 text-[var(--foreground)]/50 shrink-0 transition-transform ${isAssigneeOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedUsers.map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs bg-[var(--blueText)]/10 text-[var(--blueText)] border border-[var(--blueText)]/30"
                      >
                        {u.name}
                        <button
                          type="button"
                          onClick={() => removeAssignee(u.id)}
                          className="p-0.5 rounded-full hover:bg-[var(--blueText)]/20 transition-colors cursor-pointer select-none"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {isAssigneeOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-xl border border-[var(--shadow)]/40 bg-[var(--background)] shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-[var(--shadow)]/20">
                      <input
                        type="text"
                        autoFocus
                        placeholder="ค้นหาชื่อ..."
                        className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--wrapper)]/40 border border-[var(--shadow)]/30 outline-none focus:ring-2 focus:ring-[var(--blueText)]/40"
                        value={assigneeSearch}
                        onChange={(e) => setAssigneeSearch(e.target.value)}
                      />
                    </div>

                    <div className="max-h-52 overflow-y-auto py-1">
                      {filteredUserOptions.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-[var(--foreground)]/40 text-center">ไม่พบชื่อที่ค้นหา</div>
                      ) : (
                        filteredUserOptions.map((u) => {
                          const checked = filters.assignees.includes(u.id);
                          return (
                            <div
                              key={u.id}
                              onClick={() => toggleAssignee(u.id)}
                              className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-[var(--wrapper)]/40 cursor-pointer transition-colors select-none"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                readOnly
                                className="w-4 h-4 rounded accent-[var(--blueText)] pointer-events-none"
                              />
                              <span className="text-[var(--foreground)]/90">{u.name}</span>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="px-3 py-2 border-t border-[var(--shadow)]/20 flex justify-between bg-[var(--wrapper)]/10">
                      <button
                        type="button"
                        onClick={() => setFilters({ ...filters, assignees: [] })}
                        className="text-xs font-medium text-[var(--foreground)]/60 hover:text-[var(--redText)] transition-colors cursor-pointer select-none"
                      >
                        ล้างที่เลือก
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAssigneeOpen(false)}
                        className="text-xs font-semibold text-[var(--blueText)] hover:opacity-80 transition-colors cursor-pointer select-none"
                      >
                        เสร็จสิ้น
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="space-y-1.5">
                  <label className={labelClass}>สถานะ</label>
                  <select
                    className={selectClass}
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  >
                    <option value="" className="bg-[var(--container)] text-[var(--foreground)] font-semibold">ทั้งหมด</option>
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-[var(--container)] text-[var(--foreground)] font-semibold">{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>ชั้นความเร็ว</label>
                  <select
                    className={selectClass}
                    value={filters.urgency_level}
                    onChange={(e) => setFilters({ ...filters, urgency_level: e.target.value })}
                  >
                    <option value="" className="bg-[var(--container)] text-[var(--foreground)] font-semibold">ทั้งหมด</option>
                    {URGENCY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="bg-[var(--container)] text-[var(--foreground)] font-semibold">{opt}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>ชั้นความลับ</label>
                  <select
                    className={selectClass}
                    value={filters.secret_level}
                    onChange={(e) => setFilters({ ...filters, secret_level: e.target.value })}
                  >
                    <option value="" className="bg-[var(--container)] text-[var(--foreground)] font-semibold">ทั้งหมด</option>
                    {SECRET_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="bg-[var(--container)] text-[var(--foreground)] font-semibold">{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-[var(--wrapper)]/10 border-t border-[var(--shadow)]/20 flex justify-end gap-3 pb-8 sm:pb-4">
              <button
                onClick={handleClear}
                className="px-5 py-2 text-sm font-medium rounded-xl text-[var(--foreground)]/70 hover:bg-[var(--wrapper)]/50 transition-colors cursor-pointer select-none"
              >
                ล้างค่า
              </button>
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2 text-sm font-semibold rounded-xl bg-[var(--foreground)] text-[var(--background)] shadow-md hover:opacity-90 active:scale-95 transition-all cursor-pointer select-none"
              >
                ดูผลลัพธ์
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};