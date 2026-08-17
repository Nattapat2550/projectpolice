import React from 'react';
import { useRouter } from 'next/navigation';
import { FileText, ChevronDown } from 'lucide-react';

export interface Assignee {
  assignment_id: string;
  user_id: string | null;
  role_or_name: string;
  personInCharge?: string;
  color?: string;
}

const USER_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#6366f1", "#06b6d4", "#f97316"
];

export function getAssigneeColor(seed: string, color?: string): string {
  if (color && color.startsWith('#')) return color;
  if (!seed) return "#3b82f6";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

export function getStatusBadgeStyle(status?: string): string {
  const s = status?.toLowerCase();
  if (s === 'completed' || s === 'success') {
    return 'bg-[var(--greenBG)]/40 text-[var(--greenText)] border-[var(--greenBorder)]/60';
  }
  if (s === 'problem') {
    return 'bg-[var(--redBG)]/40 text-[var(--redText)] border-[var(--redBorder)]/60';
  }
  return 'bg-[var(--yellowBG)]/40 text-[var(--yellowText)] border-[var(--yellowBorder)]/60';
}

// 💡 อัปเดตให้ตรงกับคอลัมน์จริงในตาราง `tasks` ของ DB
export interface Task {
  id: string;
  title: string;
  memo_no: string;
  memo_date: string | null;
  sign_date?: string | null;
  sender: string;
  recipient_to?: string | null;
  additional_docs?: string | null;
  status: string;
  is_urgent: boolean;
  urgency_level: string;
  secret_level: string;
  receive_no: number;
  receive_year: number;
  round?: number;
  meeting_date: string | null;
  reply_due_date: string | null;
  due_date?: string | null;
  notes?: string | null;
  document_link?: string;
  drive_web_view_link?: string;
  has_document?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  assignments?: Assignee[];
}

export type SortKey =
  | 'createdAt'
  | 'receive_no'
  | 'memo_no'
  | 'memo_date'
  | 'title'
  | 'sender'
  | 'recipient_to'
  | 'urgency_level'
  | 'secret_level'
  | 'status'
  | 'meeting_date'
  | 'reply_due_date'
  | 'due_date';

export interface SortConfig {
  key: SortKey;
  direction: 'asc' | 'desc';
}

interface TaskTableProps {
  tasks: Task[];
  getUrgencyBadgeStyle: (level: string) => string;
  getSecretBadgeStyle: (level: string) => string;
  formatDate: (dateStr: string | null | undefined) => string;
  sortConfig: SortConfig;
  onSort: (key: SortKey) => void;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onStatusChange?: (taskId: string, newStatus: string) => void;
}

const formatReceiveYear = (year?: number | string | null) => {
  if (!year) return '-';
  const numYear = typeof year === 'string' ? parseInt(year, 10) : year;
  if (isNaN(numYear) || numYear === 0) return year.toString();
  if (numYear < 2400) {
    return (numYear + 543).toString();
  }
  return numYear.toString();
};

// 🔴 เช็คว่าชื่อเรื่องมีคำว่า "กันเลขลงรับ" หรือไม่ -> ใช้ไฮไลต์ทั้งแถวเป็นสีแดง
const isKanLekLongRub = (title?: string | null) => !!title && title.includes('กันเลขลงรับ');

export const getValidExternalUrl = (url?: string | null): string | null => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('www.') || trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com')) {
    return `https://${trimmed}`;
  }
  return null;
};

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'receive_no', label: 'เลขรับ / ปี', className: 'w-[110px]' },
  { key: 'memo_no', label: 'เลขที่หนังสือ', className: 'w-[95px]' },
  { key: 'title', label: 'ชื่อเรื่อง / รายละเอียด', className: 'w-auto min-w-[150px]' },
];

const COLUMNS_AFTER_ASSIGNEE: { key: SortKey; label: string; className?: string }[] = [
  { key: 'sender', label: 'จาก (หน่วยงาน)', className: 'w-[95px]' },
  { key: 'recipient_to', label: 'ถึง', className: 'w-[80px]' },
  { key: 'urgency_level', label: 'ชั้นความเร็ว', className: 'w-[80px] text-center' },
  { key: 'status', label: 'สถานะ', className: 'w-[118px] text-center' },
  { key: 'secret_level', label: 'ชั้นความลับ', className: 'w-[75px] text-center' },
  { key: 'memo_date', label: 'วันที่หนังสือ', className: 'w-[78px]' },
  { key: 'meeting_date', label: 'วันประชุม', className: 'w-[78px]' },
  { key: 'reply_due_date', label: 'กำหนดตอบกลับ', className: 'w-[82px]' },
  { key: 'due_date', label: 'วันกำหนดส่ง', className: 'w-[82px]' },
];

const SortIcon: React.FC<{ active: boolean; direction: 'asc' | 'desc' }> = ({ active, direction }) => (
  <svg
    className={`w-3.5 h-3.5 shrink-0 transition-transform ${active ? 'text-[var(--blueText)]' : 'text-[var(--foreground)]/30'} ${
      active && direction === 'desc' ? 'rotate-180' : ''
    }`}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
  </svg>
);

const PaginationBar: React.FC<{
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}> = ({ currentPage, totalPages, totalItems, pageSize, onPageChange }) => {
  if (totalItems === 0) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  // สร้างรายการเลขหน้าแบบย่อ (แสดงหน้าปัจจุบัน +/- 2 และหน้าแรก/สุดท้ายเสมอ)
  const pageNumbers: (number | 'ellipsis')[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) {
      pageNumbers.push(p);
    } else if (pageNumbers[pageNumbers.length - 1] !== 'ellipsis') {
      pageNumbers.push('ellipsis');
    }
  }

  return (
    <div className="px-4 sm:px-6 py-4 bg-[var(--wrapper)]/10 border-t border-[var(--shadow)]/20 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-[var(--foreground)]/60">
      <div>
        แสดง {start}–{end} จากทั้งหมด {totalItems} รายการ
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-3 py-1.5 rounded-lg border border-[var(--shadow)]/40 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--wrapper)]/50 transition-colors cursor-pointer select-none"
        >
          ก่อนหน้า
        </button>

        {pageNumbers.map((p, idx) =>
          p === 'ellipsis' ? (
            <span key={`e-${idx}`} className="px-2 text-[var(--foreground)]/40">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-[2rem] px-2 py-1.5 rounded-lg transition-colors cursor-pointer select-none ${
                p === currentPage
                  ? 'bg-[var(--foreground)] text-[var(--background)] font-semibold'
                  : 'hover:bg-[var(--wrapper)]/50 border border-transparent'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-1.5 rounded-lg border border-[var(--shadow)]/40 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--wrapper)]/50 transition-colors cursor-pointer select-none"
        >
          ถัดไป
        </button>
      </div>
    </div>
  );
};

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  getUrgencyBadgeStyle,
  getSecretBadgeStyle,
  formatDate,
  sortConfig,
  onSort,
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  pageSize,
  onStatusChange,
}) => {
  const router = useRouter();

  if (tasks.length === 0) {
    return (
      <div className="bg-[var(--container)] border border-[var(--shadow)]/30 rounded-2xl p-12 text-center text-[var(--foreground)]/50 text-sm">
        ไม่พบข้อมูลงานที่ตรงตามเงื่อนไข
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 🖥️ [1] Desktop & iPad แนวนอน (ตารางเต็มรูปแบบ พร้อม sort) */}
      <div className="hidden xl:block bg-[var(--container)] rounded-lg overflow-hidden transition-all p-4 border-2 border-(--shadow)/70">
        <div className="overflow-x-auto border border-[var(--shadow)]/30 rounded-lg">
          <table className="w-full min-w-full table-fixed text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--shadow)]/30 bg-[var(--wrapper)]/30 text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground)]/70">
                {COLUMNS.map((col) => {
                  const isActive = sortConfig.key === col.key;
                  return (
                    <th key={col.key} className={`${col.className || ''} px-1.5 py-3 select-none`}>
                      <button
                        onClick={() => onSort(col.key)}
                        className={`flex items-center gap-1 hover:text-[var(--blueText)] transition-colors cursor-pointer select-none ${
                          isActive ? 'text-[var(--blueText)]' : ''
                        }`}
                        title={`เรียงตาม${col.label}`}
                      >
                        <span>{col.label}</span>
                        <SortIcon active={isActive} direction={isActive ? sortConfig.direction : 'asc'} />
                      </button>
                    </th>
                  );
                })}
                {/* 👤 ผู้รับผิดชอบ วางไว้ใกล้ชื่อเรื่อง ให้เห็นได้เลยโดยไม่ต้อง scroll ขวา */}
                <th className="w-[105px] px-1.5 py-3 select-none">ผู้รับผิดชอบ</th>
                {COLUMNS_AFTER_ASSIGNEE.map((col) => {
                  const isActive = sortConfig.key === col.key;
                  return (
                    <th key={col.key} className={`${col.className || ''} px-1.5 py-3 select-none`}>
                      <button
                        onClick={() => onSort(col.key)}
                        className={`flex items-center justify-center gap-1 hover:text-[var(--blueText)] transition-colors cursor-pointer select-none ${
                          isActive ? 'text-[var(--blueText)]' : ''
                        }`}
                        title={`เรียงตาม${col.label}`}
                      >
                        <span>{col.label}</span>
                        <SortIcon active={isActive} direction={isActive ? sortConfig.direction : 'asc'} />
                      </button>
                    </th>
                  );
                })}
                {/* 📄 เอกสารต้นฉบับ ขวาสุด */}
                <th className="w-[55px] px-1.5 py-3 select-none text-center">เอกสาร</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--shadow)]/20 text-sm">
              {tasks.map((task) => {
                const flagged = isKanLekLongRub(task.title);
                const docTarget = getValidExternalUrl(task.document_link || task.drive_web_view_link) || '';
                const hasDoc = task.has_document && !!docTarget;
                return (
                  <tr
                    key={task.id}
                    onClick={() => router.push(`/tasks/${task.id}`)}
                    className={`transition-colors group cursor-pointer ${
                      flagged
                        ? 'bg-[var(--redBG)]/25 hover:bg-[var(--redBG)]/35'
                        : 'hover:bg-[var(--wrapper)]/20'
                    }`}
                  >
                    <td className={`px-2 py-3 font-medium whitespace-nowrap ${flagged ? 'text-[var(--redText)]' : ''}`}>
                      <div className="whitespace-nowrap flex items-center">
                        <span>{task.receive_no ?? '-'}</span>
                        <span className={flagged ? 'font-normal opacity-70' : 'text-[var(--foreground)]/40 font-normal'}>/{formatReceiveYear(task.receive_year)}</span>
                        {task.round && (
                          <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-[var(--blueText)]/10 text-[var(--blueText)] font-medium border border-[var(--blueText)]/20 shrink-0">
                            ร.{task.round}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className={`px-2 py-3 font-mono text-xs overflow-hidden ${flagged ? 'text-[var(--redText)]' : 'text-[var(--foreground)]/80'}`}>
                      <div className="truncate" title={task.memo_no || '-'}>
                        {task.memo_no || '-'}
                      </div>
                    </td>

                    <td className="px-2 py-3 align-middle overflow-hidden">
                      <div
                        title={task.title || 'ไม่มีชื่อเรื่อง'}
                        className={`font-medium truncate transition-colors ${
                          flagged
                            ? 'text-[var(--redText)] font-semibold'
                            : 'text-[var(--foreground)] group-hover:text-[var(--blueText)]'
                        }`}
                      >
                        {task.title || 'ไม่มีชื่อเรื่อง'}
                      </div>
                      {task.is_urgent && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--redBG)] text-[var(--redText)] mt-0.5 animate-pulse">
                          งานเร่งด่วนระบบ
                        </span>
                      )}
                    </td>

                    {/* 👤 ผู้รับผิดชอบ */}
                    <td className="px-2 py-3 overflow-hidden">
                      <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto">
                        {task.assignments && task.assignments.length > 0 ? (
                          task.assignments.map((assign, idx) => {
                            const name = assign.personInCharge || assign.role_or_name;
                            const dotColor = getAssigneeColor(name, assign.color);
                            return (
                              <span key={assign.assignment_id || idx} className="assignee-badge inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border border-[var(--shadow)] text-[var(--foreground)]/90 bg-[var(--wrapper)]/40 truncate max-w-[130px]" title={name}>
                                <span className="w-2 h-2 rounded-full mr-1 shrink-0" style={{ backgroundColor: dotColor }}></span>
                                <span className="truncate">{name}</span>
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-xs text-[var(--foreground)]/40 italic">ยังไม่ได้มอบหมาย</span>
                        )}
                      </div>
                    </td>

                    <td className={`px-2 py-3 overflow-hidden ${flagged ? 'text-[var(--redText)]' : 'text-[var(--foreground)]/80'}`}>
                      <div className="truncate" title={task.sender || '-'}>
                        {task.sender || '-'}
                      </div>
                    </td>

                    <td className={`px-2 py-3 overflow-hidden ${flagged ? 'text-[var(--redText)]' : 'text-[var(--foreground)]/80'}`}>
                      <div className="truncate" title={task.recipient_to || '-'}>
                        {task.recipient_to || '-'}
                      </div>
                    </td>

                    <td className="px-2 py-3 text-center overflow-hidden">
                      <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full border truncate max-w-[95px] ${getUrgencyBadgeStyle(task.urgency_level)}`}>
                        {task.urgency_level || 'ปกติ'}
                      </span>
                    </td>

                    <td className="px-1 py-3 text-center">
                      <div className="relative inline-flex items-center justify-center shrink-0">
                        <select
                          value={
                            task.status === 'completed' || task.status === 'success'
                              ? 'completed'
                              : task.status === 'problem'
                              ? 'problem'
                              : 'following'
                          }
                          onChange={(e) => onStatusChange?.(task.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className={`appearance-none cursor-pointer pl-2.5 pr-5.5 py-0.5 text-xs font-semibold rounded-full border transition-all text-center focus:outline-none focus:ring-2 focus:ring-[var(--blueText)]/40 hover:opacity-90 ${getStatusBadgeStyle(
                            task.status
                          )}`}
                        >
                          <option value="following" className="bg-[var(--container)] text-[var(--foreground)] font-semibold">
                            กำลังติดตาม
                          </option>
                          <option value="problem" className="bg-[var(--container)] text-[var(--foreground)] font-semibold">
                            ติดปัญหา
                          </option>
                          <option value="completed" className="bg-[var(--container)] text-[var(--foreground)] font-semibold">
                            เสร็จสิ้น
                          </option>
                        </select>
                        <ChevronDown
                          size={11}
                          className="absolute right-1.5 pointer-events-none opacity-70 shrink-0"
                        />
                      </div>
                    </td>

                    <td className="px-2 py-3 text-center overflow-hidden">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full border truncate max-w-[85px] ${getSecretBadgeStyle(task.secret_level)}`}>
                        {task.secret_level || 'ปกติ'}
                      </span>
                    </td>

                    <td className={`px-2 py-3 text-xs whitespace-nowrap overflow-hidden ${flagged ? 'text-[var(--redText)]' : 'text-[var(--foreground)]/70'}`}>
                      <div className="truncate">
                        {formatDate(task.memo_date)}
                      </div>
                    </td>

                    <td className={`px-2 py-3 text-xs whitespace-nowrap overflow-hidden ${flagged ? 'text-[var(--redText)]' : 'text-[var(--foreground)]/70'}`}>
                      <div className="truncate">
                        {task.meeting_date ? formatDate(task.meeting_date) : '-'}
                      </div>
                    </td>

                    <td className={`px-2 py-3 text-xs whitespace-nowrap overflow-hidden ${flagged ? 'text-[var(--redText)]' : 'text-[var(--foreground)]/70'}`}>
                      <div className="truncate">
                        {task.reply_due_date ? formatDate(task.reply_due_date) : '-'}
                      </div>
                    </td>

                    <td className={`px-2 py-3 text-xs whitespace-nowrap overflow-hidden ${flagged ? 'text-[var(--redText)]' : 'text-[var(--foreground)]/70'}`}>
                      <div className="truncate">
                        {task.due_date ? formatDate(task.due_date) : '-'}
                      </div>
                    </td>

                    {/* 📄 ไอคอนเอกสารต้นฉบับ (Google Drive) ขวาสุด */}
                    <td className="px-2 py-3 text-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
                      {hasDoc ? (
                        <a
                          href={docTarget}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center p-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-800 bg-blue-500/10 hover:bg-blue-500/25 rounded-lg transition-colors border border-blue-500/20 cursor-pointer"
                          title={task.document_link || task.drive_web_view_link ? "เปิดเอกสารต้นฉบับ (Google Drive)" : "ดูรายละเอียดเอกสาร"}
                        >
                          <FileText size={16} />
                        </a>
                      ) : (
                        <span className="text-[var(--foreground)]/20 select-none" title="ไม่มีเอกสารต้นฉบับ">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={onPageChange}
        />
      </div>

      {/* 📱 [2] Mobile & iPad แนวตั้ง (UI แบบ Apple Card List) */}
      <div className="block xl:hidden space-y-3">
        {tasks.map((task) => {
          const flagged = isKanLekLongRub(task.title);
          const docTarget = getValidExternalUrl(task.document_link || task.drive_web_view_link) || '';
          const hasDoc = task.has_document && !!docTarget;
          return (
            <div
              key={task.id}
              onClick={() => router.push(`/tasks/${task.id}`)}
              className={`rounded-lg p-4 shadow-sm space-y-3.5 transition-all border cursor-pointer ${
                flagged
                  ? 'bg-[var(--redBG)]/20 border-[var(--shadow)]/30'
                  : 'bg-[var(--container)] border-[var(--shadow)]/30 hover:border-[var(--blueText)]/50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  <span className={`text-xs font-semibold px-3 py-1 rounded-sm bg-[var(--button)] ${flagged ? 'text-[var(--redText)]' : 'text-[var(--foreground)]/80'}`}>
                    เลขรับ {task.receive_no ?? '-'}
                    <span className={flagged ? 'font-normal opacity-70' : 'text-[var(--foreground)]/40 font-normal'}>/{formatReceiveYear(task.receive_year)}</span>
                    {task.round && <span className="ml-1 opacity-80 text-[10px]"> (ร.{task.round})</span>}
                  </span>
                  <span className={`font-mono text-xs ${flagged ? 'text-[var(--redText)]' : 'text-[var(--foreground)]/50'}`}>
                    {task.memo_no || '-'}
                  </span>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-sm border ${getUrgencyBadgeStyle(task.urgency_level)}` }>
                  {task.urgency_level || 'ปกติ'}
                </span>
              </div>

              <div className="space-y-1">
                <h4 className={`font-semibold text-base line-clamp-2 leading-snug ${flagged ? 'text-[var(--redText)]' : 'text-[var(--foreground)]'}`}>
                  {task.title || 'ไม่มีชื่อเรื่อง'}
                </h4>
                <div className={`text-xs flex flex-col space-y-0.5 pt-1 ${flagged ? 'text-[var(--redText)]/80' : 'text-[var(--foreground)]/60'}`}>
                  <p><span className="font-medium">จาก:</span> {task.sender || '-'}</p>
                  <p><span className="font-medium">ถึง:</span> {task.recipient_to || '-'}</p>
                  {task.additional_docs && <p><span className="font-medium">เอกสารเพิ่มเติม:</span> {task.additional_docs}</p>}
                  <p><span className="font-medium">วันที่หนังสือ:</span> {formatDate(task.memo_date)}</p>
                  <p>
                    <span className="font-medium">ชั้นความลับ:</span>{' '}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${getSecretBadgeStyle(task.secret_level)}`}>
                      {task.secret_level || 'ปกติ'}
                    </span>
                  </p>
                  {task.meeting_date && <p><span className="font-medium">วันประชุม:</span> {formatDate(task.meeting_date)}</p>}
                  {task.reply_due_date && <p><span className="font-medium">กำหนดตอบกลับ:</span> {formatDate(task.reply_due_date)}</p>}
                  {task.due_date && <p><span className="font-medium">วันกำหนดส่ง:</span> {formatDate(task.due_date)}</p>}
                </div>
              </div>

              <div className="pt-2.5 border-t border-[var(--shadow)]/20 flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1 max-w-[65%]">
                  {task.assignments && task.assignments.length > 0 ? (
                    task.assignments.map((assign, idx) => (
                      <span key={assign.assignment_id || idx} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-[var(--wrapper)]/60 text-[var(--foreground)]/90 border border-[var(--shadow)]/30">
                        {assign.personInCharge || assign.role_or_name}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-[var(--foreground)]/40 italic">ยังไม่มอบหมาย</span>
                  )}
                </div>

                <div className="flex items-center space-x-1.5 shrink-0">
                  {hasDoc && (
                    <a
                      href={docTarget}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded border border-blue-500/20 transition-colors shrink-0 cursor-pointer"
                      title={task.document_link || task.drive_web_view_link ? "เปิดเอกสารต้นฉบับ (Google Drive)" : "ดูรายละเอียดเอกสาร"}
                    >
                      <FileText size={13} />
                      <span>เอกสาร</span>
                    </a>
                  )}
                  <div className="relative inline-flex items-center justify-center">
                    <select
                      value={
                        task.status === 'completed' || task.status === 'success'
                          ? 'completed'
                          : task.status === 'problem'
                          ? 'problem'
                          : 'following'
                      }
                      onChange={(e) => onStatusChange?.(task.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className={`appearance-none cursor-pointer pl-3 pr-6 py-0.5 text-[11px] font-semibold rounded-full border transition-all text-center focus:outline-none focus:ring-2 focus:ring-[var(--blueText)]/40 ${getStatusBadgeStyle(
                        task.status
                      )}`}
                    >
                      <option value="following" className="bg-[var(--container)] text-[var(--foreground)] font-semibold">
                        กำลังติดตาม
                      </option>
                      <option value="problem" className="bg-[var(--container)] text-[var(--foreground)] font-semibold">
                        ติดปัญหา
                      </option>
                      <option value="completed" className="bg-[var(--container)] text-[var(--foreground)] font-semibold">
                        เสร็จสิ้น
                      </option>
                    </select>
                    <ChevronDown
                      size={11}
                      className="absolute right-1.5 pointer-events-none opacity-70 shrink-0"
                    />
                  </div>

                </div>
              </div>
            </div>
          );
        })}

        <div className="bg-[var(--container)] border border-[var(--shadow)]/30 rounded-2xl overflow-hidden">
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={onPageChange}
          />
        </div>
      </div>
    </div>
  );
};