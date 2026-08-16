'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Header, SearchFilters, emptyFilters, UserOption } from '@/components/firstpage/Header';
import { StatCard } from '@/components/firstpage/StatCard';
import { TaskTable, Task, SortKey, SortConfig, getAssigneeColor } from '@/components/firstpage/TaskTable';
import Link from 'next/link';
import Swal from 'sweetalert2';
import { ChevronDown, CircleDashed, Flame, Hourglass, ListTodo, NotebookPen } from 'lucide-react';

const PAGE_SIZE = 20;

interface UserMeta {
  id?: string;
  name: string;
  color?: string;
}

function cleanTitleOrRank(str: string): string {
  if (!str) return '';
  let s = str.trim();
  s = s.replace(/[\(\[\（].*?[\)\]\）]/g, '').trim();
  s = s.replace(/^(?:พล\.ต\.อ\.|พล\.ต\.ท\.|พล\.ต\.ต\.|พ\.ต\.อ\.|พ\.ต\.ท\.|พ\.ต\.ต\.|ร\.ต\.อ\.|ร\.ต\.ท\.|ร\.ต\.ต\.|ด\.ต\.|จ\.ส\.ต\.|ส\.ต\.อ\.|ส\.ต\.ท\.|ส\.ต\.ต\.|นาย|นางสาว|นาง|น\.ส\.)\s*/gi, '').trim();
  return s || str.trim();
}

function resolveAssigneeInfo(assign: any, usersMap: Map<string, UserMeta>, userByNameMap: Map<string, UserMeta>): { name: string; color?: string; user_id?: string | null } {
  const userIdStr = assign?.user_id ? String(assign.user_id) : null;
  if (userIdStr && usersMap.has(userIdStr)) {
    const matched = usersMap.get(userIdStr)!;
    return { name: matched.name, color: assign?.color && assign.color !== '#e5e7eb' ? assign.color : matched.color, user_id: matched.id || userIdStr };
  }
  const name =
    assign?.name ||
    assign?.personInCharge ||
    assign?.role_or_name ||
    assign?.responsible_person ||
    'ไม่ระบุชื่อ';

  const trimmed = name.trim();
  const clean = cleanTitleOrRank(trimmed);

  const matchedByName = userByNameMap.get(trimmed.toLowerCase()) || userByNameMap.get(clean.toLowerCase());
  const color = (assign?.color && assign.color !== '#e5e7eb') ? assign.color : matchedByName?.color;
  return { name: matchedByName ? matchedByName.name : trimmed, color, user_id: matchedByName?.id || null };
}

// 💡 API ของ backend มีการส่งข้อมูลมาได้ 2 รูปแบบ (list แบบย่อ กับ detail แบบเต็ม)
// ฟังก์ชันนี้ทำหน้าที่ normalize ให้กลายเป็นรูปแบบเดียวกันเสมอ ไม่ว่า backend จะส่ง
// title/name, is_urgent/isUrgent, assignments/assigneesData แบบไหนมาก็ตาม
function normalizeTask(raw: any, usersMap: Map<string, UserMeta>, userByNameMap: Map<string, UserMeta>): Task {
  const rawAssignments: any[] = raw.assignments ?? raw.assigneesData ?? [];

  let itemsToProcess: any[] = [];
  if (Array.isArray(rawAssignments) && rawAssignments.length > 0) {
    itemsToProcess = rawAssignments;
  } else if (raw.personInCharge && raw.personInCharge !== 'ไม่ระบุ') {
    itemsToProcess = [{ personInCharge: raw.personInCharge }];
  }

  const assignments: any[] = [];
  const addedNames = new Set<string>();

  itemsToProcess.forEach((a, idx) => {
    const rawName = a?.name || a?.personInCharge || a?.role_or_name || a?.responsible_person || '';
    const splitNames = typeof rawName === 'string' && /[,;\n]/.test(rawName)
      ? rawName.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
      : [rawName];

    splitNames.forEach((nameStr, subIdx) => {
      const info = resolveAssigneeInfo({ ...a, name: nameStr, personInCharge: nameStr, role_or_name: nameStr }, usersMap, userByNameMap);
      const displayName = info.name || nameStr || 'ไม่ระบุชื่อ';

      if (displayName && !addedNames.has(displayName.toLowerCase())) {
        addedNames.add(displayName.toLowerCase());
        assignments.push({
          assignment_id: a?.assignment_id || `${raw.id}-${info.user_id || idx}-${subIdx}`,
          user_id: info.user_id || a?.user_id || null,
          role_or_name: displayName,
          personInCharge: displayName,
          color: info.color || '#e5e7eb',
        });
      }
    });
  });

  return {
    id: raw.id,
    title: raw.title ?? raw.name ?? 'ไม่มีชื่อเรื่อง',
    memo_no: raw.memo_no ?? raw.memoNo ?? '-',
    memo_date: raw.memo_date ?? raw.date ?? null,
    sign_date: raw.sign_date ?? null,
    sender: raw.sender ?? '-',
    recipient_to: raw.recipient_to ?? null,
    additional_docs: raw.additional_docs ?? null,
    status: raw.status ?? 'following',
    is_urgent: raw.is_urgent ?? raw.isUrgent ?? false,
    urgency_level: raw.urgency_level ?? 'ปกติ',
    secret_level: raw.secret_level ?? 'ปกติ',
    receive_no: Number(raw.receive_no ?? 0),
    receive_year: Number(raw.receive_year ?? 0),
    meeting_date: raw.meeting_date ?? null,
    reply_due_date: raw.reply_due_date ?? null,
    due_date: raw.due_date ?? raw.date ?? null,
    notes: raw.notes ?? null,
    document_link: raw.document_link || raw.drive_web_view_link || null,
    drive_web_view_link: raw.drive_web_view_link || raw.document_link || null,
    has_document: !!(raw.document_link || raw.drive_web_view_link || raw.document_id),
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
    assignments,
  };
}

// ค่าสำหรับใช้เรียง urgency/secret ตามลำดับความรุนแรงจริง แทนการเรียง A-Z เฉยๆ
const URGENCY_RANK: Record<string, number> = { 'ปกติ': 0, 'ด่วน': 1, 'ด่วนมาก': 2, 'ด่วนที่สุด': 3 };
const SECRET_RANK: Record<string, number> = { 'ปกติ': 0, 'ลับ': 1, 'ลับมาก': 2, 'ลับที่สุด': 3 };

function getSortValue(task: Task, key: SortKey): number | string {
  switch (key) {
    case 'createdAt': {
      const v = task.createdAt;
      return v ? new Date(v).getTime() : 0;
    }
    case 'receive_no':
      return task.receive_no ?? 0;
    case 'memo_no':
    case 'title':
    case 'sender':
    case 'status':
      return (task[key] ?? '').toString().toLowerCase();
    case 'urgency_level':
      return URGENCY_RANK[task.urgency_level] ?? 0;
    case 'secret_level':
      return SECRET_RANK[task.secret_level] ?? 0;
    case 'memo_date':
    case 'meeting_date':
    case 'reply_due_date':
    case 'due_date': {
      const v = task[key];
      return v ? new Date(v).getTime() : 0;
    }
    default:
      return '';
  }
}

export default function HomePage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const handleStatusChange = async (taskId: string, newStatus: string) => {
      try {
          const localToken = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
          const cookieToken = typeof document !== 'undefined' ? document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] : null;
          const token = (localToken && localToken !== "undefined") ? localToken : (cookieToken || null);

          if (!token) {
              Swal.fire({
                  icon: 'warning',
                  title: 'ไม่อนุญาต',
                  text: 'กรุณาเข้าสู่ระบบก่อนทำการเปลี่ยนสถานะงาน',
                  confirmButtonText: 'เข้าสู่ระบบ',
                  showCancelButton: true,
                  cancelButtonText: 'ยกเลิก'
              }).then((result) => {
                  if (result.isConfirmed) router.push('/login');
              });
              return;
          }

          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5003';
          const response = await fetch(`${backendUrl}/api/v1/tasks/${taskId}/status`, {
              method: 'PUT',
              headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({ status: newStatus })
          });

          if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              throw new Error(errData.message || 'ไม่สามารถอัปเดตสถานะได้');
          }

          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

          const statusLabelMap: Record<string, string> = {
              following: 'กำลังติดตาม',
              problem: 'ติดปัญหา',
              completed: 'เสร็จสิ้น',
              success: 'เสร็จสิ้น',
          };
          const label = statusLabelMap[newStatus] || newStatus;

          Swal.fire({
              icon: 'success',
              title: 'อัปเดตสถานะสำเร็จ',
              text: `เปลี่ยนสถานะเป็น "${label}" เรียบร้อยแล้ว`,
              toast: true,
              position: 'top-end',
              showConfirmButton: false,
              timer: 2000,
              timerProgressBar: true,
          });
      } catch (error: any) {
          Swal.fire('ข้อผิดพลาด', error.message, 'error');
      }
  };

  const handleReserveTask = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem("token") || document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] : null;
    if (!token) {
        Swal.fire({ icon: 'warning', title: 'ไม่อนุญาต', text: 'กรุณาเข้าสู่ระบบก่อนจองเลขรับ' });
        return;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
    
    try {
        // Fetch next receive number
        let nextNo = "";
        try {
            const resNo = await fetch(`${backendUrl}/api/v1/tasks/next-reserve-no`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (resNo.ok) {
                const dataNo = await resNo.json();
                nextNo = dataNo.nextReceiveNo?.toString() || "";
            }
        } catch (err) {
            console.error("Failed to fetch next reserve no", err);
        }

        const { value: rangeInput } = await Swal.fire({
            title: 'จองเลขรับ',
            html: 'ระบุเลขรับ หรือ ระบุเป็นช่วง (เช่น <b>100</b> หรือ <b>100-105</b>)',
            input: 'text',
            inputValue: nextNo,
            showCancelButton: true,
            confirmButtonText: 'ยืนยันการจอง',
            cancelButtonText: 'ยกเลิก',
            inputValidator: (value) => {
                if (!value) return 'กรุณาระบุเลขรับที่ต้องการจอง';
                if (!/^\d+(-\d+)?$/.test(value.trim())) return 'รูปแบบไม่ถูกต้อง (เช่น 100 หรือ 100-105)';
                if (value.includes('-')) {
                    const parts = value.split('-');
                    if (parseInt(parts[0], 10) > parseInt(parts[1], 10)) {
                        return 'เลขเริ่มต้นต้องน้อยกว่าหรือเท่ากับเลขสิ้นสุด';
                    }
                }
            }
        });

        if (rangeInput) {
            const response = await fetch(`${backendUrl}/api/v1/tasks/reserve`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ range: rangeInput.trim() })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || "Failed to reserve task");
            }
            
            const data = await response.json();
            if (data.startNo === data.endNo) {
                Swal.fire('สำเร็จ', `จองเลขรับสำเร็จ! เลขรับที่ได้คือ: ${data.startNo}/${data.receive_year}`, 'success');
            } else {
                Swal.fire('สำเร็จ', `จองเลขรับจำนวน ${data.count} รายการ สำเร็จ! ตั้งแต่เลขที่: ${data.startNo}/${data.receive_year} ถึง ${data.endNo}/${data.receive_year}`, 'success');
            }
            
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        }
    } catch (error: any) {
        Swal.fire('เกิดข้อผิดพลาด', error.message || 'ไม่สามารถจองเลขรับได้', 'error');
    }
  };

  const [filters, setFilters] = useState<SearchFilters>({ ...emptyFilters });
  const [usersList, setUsersList] = useState<UserOption[]>([]);
  const [quickFilter, setQuickFilter] = useState<'all' | 'urgent' | 'following'>('all');

  // เรียงตามวันที่รับล่าสุดจากมากไปน้อย (ล่าสุดขึ้นก่อน) เป็นค่าเริ่มต้น
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'createdAt', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token) {
      router.replace('/login');
      return;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5003';

    const fetchTasks = async () => {
      try {
        setLoading(true);

        // 👥 ดึงรายชื่อ users ทั้งหมดมาก่อน เพื่อทำ map user_id -> name & color
        const usersMap = new Map<string, UserMeta>();
        const userByNameMap = new Map<string, UserMeta>();
        try {
          const usersRes = await fetch(`${backendUrl}/api/v1/users`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          if (usersRes.ok) {
            const usersData = await usersRes.json();
            const rawUsers: any[] = usersData.success && Array.isArray(usersData.data)
              ? usersData.data
              : Array.isArray(usersData)
              ? usersData
              : [];
            const options: UserOption[] = [];
            rawUsers.forEach((u) => {
              const uIdStr = u?.id || u?._id ? String(u.id || u._id) : null;
              if (uIdStr && u?.name) {
                const meta = { id: uIdStr, name: u.name, color: u.color };
                usersMap.set(uIdStr, meta);
                userByNameMap.set(u.name.trim(), meta);
                options.push(meta);
              }
            });
            setUsersList(options.sort((a, b) => a.name.localeCompare(b.name, 'th')));
          }
        } catch {
          // ถ้าดึง users ไม่ได้ ไม่ต้อง block การแสดง tasks
        }

        const response = await fetch(`${backendUrl}/api/v1/tasks`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user_id');
          document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
          router.replace('/login');
          return;
        }

        if (!response.ok) {
          throw new Error('ไม่สามารถดึงข้อมูลงานได้ หรือไม่มีสิทธิ์เข้าถึง');
        }

        const resData = await response.json();

        const rawList: any[] = resData.success && Array.isArray(resData.data)
          ? resData.data
          : Array.isArray(resData)
          ? resData
          : [];

        setTasks(rawList.map((raw) => normalizeTask(raw, usersMap, userByNameMap)));
      } catch (err: any) {
        setError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [router]);

  const getUrgencyBadgeStyle = (level: string) => {
    switch (level) {
      case 'ด่วนที่สุด':
        return 'bg-[var(--redBG)]/40 text-[var(--redText)] border-[var(--redBorder)]';
      case 'ด่วนมาก':
        return 'bg-[var(--orangeBG)]/40 text-[var(--orangeText)] border-[var(--orangeBorder)]';
      case 'ด่วน':
        return 'bg-[var(--yellowBG)]/40 text-[var(--yellowText)] border-[var(--yellowBorder)]';
      case 'ปกติ':
      default:
        return 'bg-[var(--greenBG)]/40 text-[var(--greenText)] border-[var(--greenBorder)]';
    }
  };

  const getSecretBadgeStyle = (level: string) => {
    switch (level) {
      case 'ลับที่สุด':
        return 'bg-[var(--redBG)]/40 text-[var(--redText)] border-[var(--redBorder)]';
      case 'ลับมาก':
        return 'bg-[var(--orangeBG)]/40 text-[var(--orangeText)] border-[var(--orangeBorder)]';
      case 'ลับ':
        return 'bg-[var(--yellowBG)]/40 text-[var(--yellowText)] border-[var(--yellowBorder)]';
      case 'ปกติ':
      default:
        return 'bg-[var(--greenBG)]/40 text-[var(--greenText)] border-[var(--greenBorder)]';
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const normalizeDigits = (str?: string | number | null): string => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[๐-๙]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0e50 + 48));
  };

  // 🔍 กรองข้อมูลตามฟิลด์ที่ตรงกับ DB จริง
  const filteredTasks = useMemo(() => {
    const t = normalizeDigits(filters.title.trim().toLowerCase());
    const rNo = normalizeDigits(filters.receive_no.trim());
    const rYear = normalizeDigits(filters.receive_year.trim());
    const m = normalizeDigits(filters.memo_no.trim().toLowerCase());
    const s = normalizeDigits(filters.sender.trim().toLowerCase());
    const recTo = normalizeDigits((filters.recipient_to || '').trim().toLowerCase());
    const addDocs = normalizeDigits((filters.additional_docs || '').trim().toLowerCase());
    const status = filters.status.trim();
    const urgency = filters.urgency_level.trim();
    const secret = filters.secret_level.trim();

    // 👥 ผู้รับผิดชอบเลือกได้หลายคน (intersect): งานต้องมี "ครบทุกคน" ที่เลือกไว้ ไม่ใช่แค่คนใดคนหนึ่ง
    const idToName = new Map(usersList.map((u) => [u.id, u.name]));
    const selectedAssigneeNames = filters.assignees
      .map((id) => idToName.get(id))
      .filter((n): n is string => !!n);

    return tasks.filter((task) => {
      const matchTitle = !t || normalizeDigits(task.title?.toLowerCase()).includes(t);
      const matchReceiveNo = !rNo || normalizeDigits(task.receive_no).includes(rNo);
      const thYear = task.receive_year ? (task.receive_year < 2400 ? task.receive_year + 543 : task.receive_year).toString() : '';
      const matchReceiveYear = !rYear || normalizeDigits(task.receive_year).includes(rYear) || normalizeDigits(thYear).includes(rYear);
      const matchMemo = !m || normalizeDigits(task.memo_no?.toLowerCase()).includes(m);
      const matchSender = !s || normalizeDigits(task.sender?.toLowerCase()).includes(s);
      const matchRecipientTo = !recTo || normalizeDigits(task.recipient_to?.toLowerCase()).includes(recTo);
      const matchAdditionalDocs = !addDocs || normalizeDigits(task.additional_docs?.toLowerCase()).includes(addDocs);
      const matchStatus =
        !status ||
        task.status === status ||
        (status === 'completed' && task.status === 'success') ||
        (status === 'success' && task.status === 'completed');
      const matchUrgency = !urgency || task.urgency_level === urgency;
      const matchSecret = !secret || task.secret_level === secret;

      const matchQuickFilter =
        quickFilter === 'all'
          ? true
          : quickFilter === 'urgent'
          ? ['ด่วน', 'ด่วนมาก', 'ด่วนที่สุด'].includes(task.urgency_level)
          : quickFilter === 'following'
          ? ['following', 'pending'].includes(task.status)
          : true;

      const taskAssigneeNames = (task.assignments || [])
        .map((a) => a.personInCharge || a.role_or_name)
        .filter((n): n is string => !!n);
      const matchAssignee =
        selectedAssigneeNames.length === 0 ||
        selectedAssigneeNames.some((name) => taskAssigneeNames.includes(name));
      return (
        matchTitle &&
        matchReceiveNo &&
        matchReceiveYear &&
        matchMemo &&
        matchSender &&
        matchRecipientTo &&
        matchAdditionalDocs &&
        matchStatus &&
        matchUrgency &&
        matchSecret &&
        matchAssignee &&
        matchQuickFilter
      );
    });
  }, [tasks, filters, usersList, quickFilter]);

  // ↕️ เรียงข้อมูล: เรียงวันที่รับล่าสุด (มากไปน้อย) -> อัปเดตล่าสุด -> เลขรับมากสุดขึ้นก่อน
  const sortedTasks = useMemo(() => {
    const list = [...filteredTasks];
    list.sort((a, b) => {
      // 1. ถ้าผู้ใช้คลิกเลือกเรียงตามคอลัมน์ใดคอลัมน์หนึ่งเป็นการเฉพาะ (ที่ไม่ใช่ createdAt)
      if (sortConfig.key !== 'createdAt') {
        const valA = getSortValue(a, sortConfig.key);
        const valB = getSortValue(b, sortConfig.key);

        if (typeof valA === 'number' && typeof valB === 'number') {
          if (valA !== valB) {
            return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
          }
        } else {
          const strA = String(valA);
          const strB = String(valB);
          const cmp = strA.localeCompare(strB, 'th');
          if (cmp !== 0) {
            return sortConfig.direction === 'asc' ? cmp : -cmp;
          }
        }
      }

      // 2. เรียงตามวันที่รับล่าสุด (มากไปน้อย / ล่าสุดขึ้นก่อน)
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) {
        return sortConfig.key === 'createdAt' && sortConfig.direction === 'asc'
          ? timeA - timeB
          : timeB - timeA;
      }

      // 3. อันไหนอัปเดตล่าสุดก็ขึ้นก่อน
      const updA = a.updatedAt ? new Date(a.updatedAt).getTime() : timeA;
      const updB = b.updatedAt ? new Date(b.updatedAt).getTime() : timeB;
      if (updA !== updB) {
        return updB - updA;
      }

      // 4. ถ้าวันที่รับและอัปเดตเท่ากัน เรียงตามเลขรับจากมากไปน้อย (มากสุดขึ้นก่อน)
      const noA = Number(a.receive_no || 0);
      const noB = Number(b.receive_no || 0);
      if (noA !== noB) {
        return noB - noA;
      }

      // 5. ถ้าเลขรับเท่ากัน เรียงตามปีทะเบียน (มากไปน้อย)
      const yearA = Number(a.receive_year || 0);
      const yearB = Number(b.receive_year || 0);
      return yearB - yearA;
    });
    return list;
  }, [filteredTasks, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / PAGE_SIZE));
  const currentPageClamped = Math.min(currentPage, totalPages);

  const displayTasks = useMemo(() => {
    const start = (currentPageClamped - 1) * PAGE_SIZE;
    return sortedTasks.slice(start, start + PAGE_SIZE);
  }, [sortedTasks, currentPageClamped]);

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedUserNames = useMemo(() => {
    const userMap = new Map(usersList.map((u) => [u.id, u.name]));
    return filters.assignees.map((id) => userMap.get(id)).filter(Boolean);
  }, [filters.assignees, usersList]);

  // Toggle user selection for multi-choice filtering
  const handleUserToggle = (userId: string) => {
    setFilters((prev) => {
      const exists = prev.assignees.includes(userId);
      const updatedAssignees = exists
        ? prev.assignees.filter((id) => id !== userId)
        : [...prev.assignees, userId];

      return {
        ...prev,
        assignees: updatedAssignees,
      };
    });
  };

  return (
    <div className="min-h-screen bg-[var(--wrapper)] text-[var(--foreground)] transition-colors duration-300">
      
      <Header filters={filters} setFilters={setFilters} users={usersList} />
    
      <main className="w-full max-w-[1920px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">

        <div className='bg-[var(--container)] p-4 rounded-lg border-2 border-(--shadow)/70'>
          <div className="flex flex-col gap-4 mb-4 ">
            
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Left side: Action Buttons */}
              <div className="flex flex-row items-center w-full md:w-2/5 gap-4">
                <button 
                  onClick={handleReserveTask}
                  style={{ 
                    width: '100%',
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    minHeight: '48px', 
                    padding: '10px 24px',
                    backgroundColor: 'var(--button)',
                    color: 'var(--blueText)',
                    border: '1.5px solid var(--shadow)',
                    borderRadius: '0.4rem',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  <NotebookPen className='size-5'></NotebookPen> &nbsp; จองเลขรับ
                </button>
                <Link 
                  href={'/addFile'} 
                  aria-label="ไปหน้าเพิ่มงานติดตามใหม่" 
                  style={{ 
                    width: '100%',
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    minHeight: '48px', 
                    padding: '10px 24px',
                    backgroundColor: 'var(--greenBG)',
                    color: 'var(--greenText)',
                    border: '1.5px solid var(--greenText)',
                    borderRadius: '0.4rem',
                    textDecoration: 'none',
                    fontWeight: 'bold'
                  }}
                >
                  + เพิ่มงานติดตาม
                </Link>
              </div>

              {/* Right side: Multi-Select Animated Dropdown */}
              <div className="relative w-full sm:w-80 md:w-[360px] shrink-0" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full h-[48px] px-4 py-2 border-2 rounded-md bg-[var(--button)] border-[var(--wrapper)] text-left flex items-center justify-between focus:outline-none transition-colors duration-150 cursor-pointer select-none"
                >
                  <span className="truncate text-sm font-medium">
                    {filters.assignees.length === 0
                      ? '-- เลือกผู้รับผิดชอบ -- (กำลังแสดงทั้งหมด)'
                      : `เลือกแล้ว (${filters.assignees.length} คน): ${selectedUserNames.join(', ')}`}
                  </span>
                  <span className={`transform transition-transform duration-200 ml-2 shrink-0 ${isDropdownOpen ? 'rotate-180' : 'rotate-0'}`}>
                    <ChevronDown></ChevronDown>
                  </span>
                </button>

                {/* Animated Dropdown Menu */}
                <div
                  className={`absolute left-0 right-0 top-full mt-2 z-50 bg-[var(--container)] border-2 border-[var(--shadow)] rounded-xl shadow-xl max-h-60 overflow-y-auto transition-opacity duration-150 origin-top transform ${
                    isDropdownOpen
                      ? 'opacity-100 scale-y-100 translate-y-0 pointer-events-auto'
                      : 'opacity-0 scale-y-95 -translate-y-2 pointer-events-none'
                  }`}
                >
                  {/* Clear All Option inside dropdown */}
                  {filters.assignees.length > 0 && (
                    <div
                      onClick={() => setFilters((prev) => ({ ...prev, assignees: [] }))}
                      className="px-4 py-2.5 text-xs text-red-500 hover:bg-red-500/10 cursor-pointer border-b border-[var(--shadow)] font-bold flex items-center justify-between transition-colors select-none"
                    >
                      <span>✕ ล้างการเลือกทั้งหมด</span>
                    </div>
                  )}

                  {usersList.length === 0 ? (
                    <div className="p-4 text-sm text-[var(--foreground)]/60 text-center">ไม่มีข้อมูลผู้ใช้งาน</div>
                  ) : (
                    usersList.map((user) => {
                      const isSelected = filters.assignees.includes(user.id);
                      const userDotColor = getAssigneeColor(user.name, user.color);
                      return (
                        <div
                          key={user.id}
                          onClick={() => handleUserToggle(user.id)}
                          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm transition-colors duration-150 hover:bg-[var(--wrapper)] select-none border-b border-[var(--shadow)]/30 last:border-0 ${
                            isSelected ? 'font-bold text-[var(--blueText)] bg-[var(--blueBG)]/30' : 'text-[var(--foreground)] font-medium'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="w-4 h-4 rounded border-gray-300 accent-[var(--blueText)] cursor-pointer shrink-0 pointer-events-none"
                          />
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                            style={{ backgroundColor: userDotColor }}
                          />
                          <span className="truncate">{user.name}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
       
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            title="งานทั้งหมดในระบบ"
            value={tasks.length}
            icon= {<ListTodo></ListTodo>}
            isActive={quickFilter === 'all'}
            onClick={() => setQuickFilter('all')}
          />
          <StatCard
            title="งานด่วน / ด่วนที่สุด"
            value={tasks.filter(t => ['ด่วน', 'ด่วนมาก', 'ด่วนที่สุด'].includes(t.urgency_level)).length}
            icon={<Flame className='text-[var(--redText)]'></Flame>}
            valueClass="text-[var(--redText)]"
            isActive={quickFilter === 'urgent'}
            onClick={() => setQuickFilter(prev => prev === 'urgent' ? 'all' : 'urgent')}
          />
          <StatCard
            title="กำลังดำเนินการ (Following)"
            value={tasks.filter(t => ['following', 'pending'].includes(t.status)).length}
            icon={<Hourglass className='text-[var(--blueText)]'></Hourglass>}
            valueClass="text-[var(--blueText)]"
            isActive={quickFilter === 'following'}
            onClick={() => setQuickFilter(prev => prev === 'following' ? 'all' : 'following')}
          />
        </div>

        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <div className="w-8 h-8 border-4 border-[var(--blueText)] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-[var(--foreground)]/60">กำลังตรวจสอบสิทธิ์และดึงข้อมูล...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-[var(--redBG)]/20 border border-[var(--redBorder)]/40 text-[var(--redText)] text-center text-sm">
            {error}
          </div>
        )}

        {!loading && !error && (
          <TaskTable
            tasks={displayTasks}
            getUrgencyBadgeStyle={getUrgencyBadgeStyle}
            getSecretBadgeStyle={getSecretBadgeStyle}
            formatDate={formatDate}
            sortConfig={sortConfig}
            onSort={handleSort}
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedTasks.length}
            onPageChange={setCurrentPage}
            pageSize={PAGE_SIZE}
            onStatusChange={handleStatusChange}
          />
        )}
      </main>
    </div>
  );
}