import React from 'react';

export interface Assignee {
  assignment_id: string;
  user_id: string | null;
  role_or_name: string;
  personInCharge?: string;
}

// 💡 อัปเดตให้ตรงกับคอลัมน์จริงในตาราง `tasks` ของ DB
export interface Task {
  id: string;
  title: string;
  memo_no: string;
  memo_date: string | null;
  sign_date?: string | null;
  sender: string;
  status: string;
  is_urgent: boolean;
  urgency_level: string;
  secret_level: string;
  receive_no: number;
  receive_year: number;
  meeting_date: string | null;
  reply_due_date: string | null;
  due_date?: string | null;
  notes?: string | null;
  document_link?: string;
  drive_web_view_link?: string;
  createdAt?: string | null;
  assignments?: Assignee[];
}

export type SortKey =
  | 'receive_no'
  | 'memo_no'
  | 'memo_date'
  | 'title'
  | 'sender'
  | 'urgency_level'
  | 'secret_level'
  | 'status'
  | 'meeting_date'
  | 'reply_due_date';

export interface SortConfig {
  key: SortKey;
  direction: 'asc' | 'desc';
}

interface TaskTableProps {
  tasks: Task[];
  getUrgencyBadgeStyle: (level: string) => string;
  formatDate: (dateStr: string | null | undefined) => string;
  sortConfig: SortConfig;
  onSort: (key: SortKey) => void;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSize: number;
}

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'receive_no', label: 'เลขรับ / ปี', className: 'w-24' },
  { key: 'memo_no', label: 'เลขที่หนังสือ', className: 'w-32' },
  { key: 'title', label: 'ชื่อเรื่อง / รายละเอียด', className: 'w-64' },
];

const COLUMNS_AFTER_ASSIGNEE: { key: SortKey; label: string; className?: string }[] = [
  { key: 'sender', label: 'จาก (หน่วยงาน)', className: 'w-36' },
  { key: 'urgency_level', label: 'ความเร่งด่วน', className: 'w-24' },
  { key: 'status', label: 'สถานะ', className: 'w-28' },
  { key: 'secret_level', label: 'ชั้นความลับ', className: 'w-24' },
  { key: 'memo_date', label: 'วันที่หนังสือ', className: 'w-28' },
  { key: 'meeting_date', label: 'วันประชุม', className: 'w-28' },
  { key: 'reply_due_date', label: 'กำหนดตอบกลับ', className: 'w-28' },
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
          className="px-3 py-1.5 rounded-lg border border-[var(--shadow)]/40 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--wrapper)]/50 transition-colors"
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
              className={`min-w-[2rem] px-2 py-1.5 rounded-lg transition-colors ${
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
          className="px-3 py-1.5 rounded-lg border border-[var(--shadow)]/40 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--wrapper)]/50 transition-colors"
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
  formatDate,
  sortConfig,
  onSort,
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  pageSize,
}) => {
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
      <div className="hidden lg:block bg-[var(--container)] border border-[var(--shadow)]/30 rounded-2xl shadow-sm overflow-hidden transition-all">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1300px]">
            <thead>
              <tr className="border-b border-[var(--shadow)]/30 bg-[var(--wrapper)]/30 text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]/70">
                {COLUMNS.map((col) => {
                  const isActive = sortConfig.key === col.key;
                  return (
                    <th key={col.key} className={`${col.className || ''} px-3 py-4 select-none`}>
                      <button
                        onClick={() => onSort(col.key)}
                        className={`flex items-center gap-1 hover:text-[var(--blueText)] transition-colors ${
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
                <th className="w-40 px-3 py-4">ผู้รับผิดชอบ</th>
                {COLUMNS_AFTER_ASSIGNEE.map((col) => {
                  const isActive = sortConfig.key === col.key;
                  return (
                    <th key={col.key} className={`${col.className || ''} px-3 py-4 select-none`}>
                      <button
                        onClick={() => onSort(col.key)}
                        className={`flex items-center gap-1 hover:text-[var(--blueText)] transition-colors ${
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
                <th className="w-14 px-4 py-4 text-center">ลิงก์</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--shadow)]/20 text-sm">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-[var(--wrapper)]/20 transition-colors group">
                  <td className="px-3 py-4.5 font-medium whitespace-nowrap">
                    {task.receive_no ?? '-'}
                    <span className="text-[var(--foreground)]/40 font-normal">/{task.receive_year || '-'}</span>
                  </td>
                  <td className="px-3 py-4.5 whitespace-nowrap font-mono text-xs text-[var(--foreground)]/80">
                    {task.memo_no || '-'}
                  </td>
                  <td className="px-3 py-4.5">
                    <div className="font-medium text-[var(--foreground)] line-clamp-1 group-hover:text-[var(--blueText)] transition-colors">
                      {task.title || 'ไม่มีชื่อเรื่อง'}
                    </div>
                    {task.is_urgent && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--redBG)] text-[var(--redText)] mt-0.5 animate-pulse">
                        งานเร่งด่วนระบบ
                      </span>
                    )}
                  </td>

                  {/* 👤 ผู้รับผิดชอบ */}
                  <td className="px-3 py-4.5">
                    <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto">
                      {task.assignments && task.assignments.length > 0 ? (
                        task.assignments.map((assign, idx) => (
                          <span key={assign.assignment_id || idx} className="assignee-badge inline-flex items-center px-2 py-0.5 rounded text-xs border border-[var(--shadow)] text-[var(--foreground)]/90 bg-[var(--wrapper)]/40">
                            <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-[var(--blueText)] opacity-70"></span>
                            {assign.personInCharge || assign.role_or_name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[var(--foreground)]/40 italic">ยังไม่ได้มอบหมาย</span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-4.5 text-[var(--foreground)]/80 truncate">{task.sender || '-'}</td>
                  <td className="px-3 py-4.5 text-center">
                    <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full border ${getUrgencyBadgeStyle(task.urgency_level)}`}>
                      {task.urgency_level || 'ปกติ'}
                    </span>
                  </td>
                  <td className="px-3 py-4.5 text-center">
                    <span className={`inline-block px-2.5 py-0.5 text-xs rounded-md ${
                      task.status === 'success' || task.status === 'completed'
                        ? 'bg-[var(--greenBG)]/30 text-[var(--greenText)] border border-[var(--greenBorder)]/30'
                        : 'bg-[var(--wrapper)] text-[var(--foreground)]/70 border border-[var(--shadow)]/40'
                    }`}>
                      {task.status === 'following' ? 'กำลังติดตาม' : task.status === 'success' ? 'เสร็จสิ้น' : task.status}
                    </span>
                  </td>
                  <td className="px-3 py-4.5 text-center">
                    <span className="inline-block px-2 py-1 text-xs rounded-full border border-[var(--shadow)]/40 text-[var(--foreground)]/80">
                      {task.secret_level || 'ปกติ'}
                    </span>
                  </td>
                  <td className="px-3 py-4.5 whitespace-nowrap text-xs text-[var(--foreground)]/70">
                    {formatDate(task.memo_date)}
                  </td>
                  <td className="px-3 py-4.5 whitespace-nowrap text-xs text-[var(--foreground)]/70">
                    {task.meeting_date ? formatDate(task.meeting_date) : '-'}
                  </td>
                  <td className="px-3 py-4.5 whitespace-nowrap text-xs text-[var(--foreground)]/70">
                    {task.reply_due_date ? formatDate(task.reply_due_date) : '-'}
                  </td>

                  <td className="px-4 py-4.5 text-center">
                    {task.document_link || task.drive_web_view_link ? (
                      <a href={task.document_link || task.drive_web_view_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--blueText)] hover:bg-[var(--wrapper)] transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                    ) : ( <span className="text-[var(--foreground)]/20">-</span> )}
                  </td>
                </tr>
              ))}
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
      <div className="block lg:hidden space-y-3">
        {tasks.map((task) => (
          <div key={task.id} className="bg-[var(--container)] border border-[var(--shadow)]/30 rounded-2xl p-4 shadow-sm space-y-3.5 hover:border-[var(--blueText)]/50 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold bg-[var(--wrapper)] px-2.5 py-0.5 rounded-md text-[var(--foreground)]/80">
                  เลขรับ {task.receive_no ?? '-'}
                  <span className="text-[var(--foreground)]/40 font-normal">/{task.receive_year || '-'}</span>
                </span>
                <span className="font-mono text-xs text-[var(--foreground)]/50">
                  {task.memo_no || '-'}
                </span>
              </div>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getUrgencyBadgeStyle(task.urgency_level)}`}>
                {task.urgency_level || 'ปกติ'}
              </span>
            </div>

            <div className="space-y-1">
              <h4 className="font-semibold text-[var(--foreground)] text-base line-clamp-2 leading-snug">
                {task.title || 'ไม่มีชื่อเรื่อง'}
              </h4>
              <div className="text-xs text-[var(--foreground)]/60 flex flex-col space-y-0.5 pt-1">
                <p><span className="font-medium">จาก:</span> {task.sender || '-'}</p>
                <p><span className="font-medium">วันที่หนังสือ:</span> {formatDate(task.memo_date)}</p>
                <p><span className="font-medium">ชั้นความลับ:</span> {task.secret_level || 'ปกติ'}</p>
                {task.meeting_date && <p><span className="font-medium">วันประชุม:</span> {formatDate(task.meeting_date)}</p>}
                {task.reply_due_date && <p><span className="font-medium">กำหนดตอบกลับ:</span> {formatDate(task.reply_due_date)}</p>}
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
                <span className={`px-2 py-0.5 text-[11px] rounded ${
                  task.status === 'success' || task.status === 'completed'
                    ? 'bg-[var(--greenBG)]/20 text-[var(--greenText)]'
                    : 'bg-[var(--wrapper)] text-[var(--foreground)]/70'
                }`}>
                  {task.status === 'following' ? 'ติดตามอยู่' : task.status === 'success' ? 'เสร็จสิ้น' : task.status}
                </span>

                {(task.document_link || task.drive_web_view_link) && (
                  <a href={task.document_link || task.drive_web_view_link} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full bg-[var(--wrapper)] text-[var(--blueText)] active:bg-[var(--shadow)]">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}

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