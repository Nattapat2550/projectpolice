'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Header, SearchFilters, emptyFilters, UserOption } from '@/components/firstpage/Header';
import { StatCard } from '@/components/firstpage/StatCard';
import { TaskTable, Task, SortKey, SortConfig } from '@/components/firstpage/TaskTable';

const PAGE_SIZE = 20;

// resolve ชื่อผู้รับผิดชอบจริง: ถ้ามี user_id และหาเจอใน users map ให้ใช้ชื่อนั้นก่อนเสมอ
// (ข้อมูลดิบจาก backend บางทีมีแค่ user_id โดยไม่มีชื่อติดมาด้วย)
// 🐛 FIX: GET /api/v1/tasks (backend) รวม assignee มาเป็น `assigneesData: [{ name, color }]`
// โดย "ไม่มี" user_id ติดมาด้วยเลย (ดู be.md — "Aggregates and yields assignees names and colors")
// เดิมฟังก์ชันนี้เช็คแค่ personInCharge / role_or_name / responsible_person เลยไม่เจอ `name`
// แล้ว fallback ไปเป็น 'ไม่ระบุชื่อ' ทุกครั้ง — นี่คือสาเหตุที่ตารางขึ้นชื่อผู้รับผิดชอบผิด
function resolveAssigneeName(assign: any, usersMap: Map<string, string>): string {
  if (assign?.user_id && usersMap.has(assign.user_id)) {
    return usersMap.get(assign.user_id)!;
  }
  return (
    assign?.name ||
    assign?.personInCharge ||
    assign?.role_or_name ||
    assign?.responsible_person ||
    'ไม่ระบุชื่อ'
  );
}

// 💡 API ของ backend มีการส่งข้อมูลมาได้ 2 รูปแบบ (list แบบย่อ กับ detail แบบเต็ม)
// ฟังก์ชันนี้ทำหน้าที่ normalize ให้กลายเป็นรูปแบบเดียวกันเสมอ ไม่ว่า backend จะส่ง
// title/name, is_urgent/isUrgent, assignments/assigneesData แบบไหนมาก็ตาม
function normalizeTask(raw: any, usersMap: Map<string, string>): Task {
  const rawAssignments: any[] = raw.assignments ?? raw.assigneesData ?? [];

  const assignments =
    Array.isArray(rawAssignments) && rawAssignments.length > 0
      ? rawAssignments.map((a, idx) => {
          const name = resolveAssigneeName(a, usersMap);
          return {
            assignment_id: a.assignment_id || `${raw.id}-${a.user_id || idx}`,
            user_id: a.user_id ?? null,
            role_or_name: a.role_or_name || name,
            personInCharge: name,
          };
        })
      : raw.personInCharge && raw.personInCharge !== 'ไม่ระบุ'
      ? [
          {
            assignment_id: `${raw.id}-person`,
            user_id: raw.user_id ?? null,
            role_or_name: raw.personInCharge,
            personInCharge:
              (raw.user_id && usersMap.get(raw.user_id)) || raw.personInCharge,
          },
        ]
      : [];

  return {
    id: raw.id,
    title: raw.title ?? raw.name ?? 'ไม่มีชื่อเรื่อง',
    memo_no: raw.memo_no ?? raw.memoNo ?? '-',
    memo_date: raw.memo_date ?? raw.date ?? null,
    sign_date: raw.sign_date ?? null,
    sender: raw.sender ?? '-',
    status: raw.status ?? 'following',
    is_urgent: raw.is_urgent ?? raw.isUrgent ?? false,
    urgency_level: raw.urgency_level ?? 'ปกติ',
    secret_level: raw.secret_level ?? 'ปกติ',
    receive_no: Number(raw.receive_no ?? 0),
    receive_year: Number(raw.receive_year ?? 0),
    meeting_date: raw.meeting_date ?? null,
    reply_due_date: raw.reply_due_date ?? null,
    due_date: raw.due_date ?? null,
    notes: raw.notes ?? null,
    document_link: raw.document_link,
    drive_web_view_link: raw.drive_web_view_link,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    assignments,
  };
}

// ค่าสำหรับใช้เรียง urgency/secret ตามลำดับความรุนแรงจริง แทนการเรียง A-Z เฉยๆ
const URGENCY_RANK: Record<string, number> = { 'ปกติ': 0, 'ด่วน': 1, 'ด่วนมาก': 2, 'ด่วนที่สุด': 3 };
const SECRET_RANK: Record<string, number> = { 'ปกติ': 0, 'ลับ': 1, 'ลับมาก': 2, 'ลับที่สุด': 3 };

function getSortValue(task: Task, key: SortKey): number | string {
  switch (key) {
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
    case 'reply_due_date': {
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

  const [filters, setFilters] = useState<SearchFilters>({ ...emptyFilters });
  const [usersList, setUsersList] = useState<UserOption[]>([]);

  // เรียงตาม receive_year ก่อน แล้วต่อด้วย receive_no จากน้อยไปมาก เป็นค่าเริ่มต้น
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'receive_no', direction: 'asc' });
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

        // 👥 ดึงรายชื่อ users ทั้งหมดมาก่อน เพื่อทำ map user_id -> name
        // ใช้สำหรับ resolve ชื่อผู้รับผิดชอบที่ backend ส่งมาแค่ user_id
        const usersMap = new Map<string, string>();
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
              if (u?.id && u?.name) {
                usersMap.set(u.id, u.name);
                options.push({ id: u.id, name: u.name });
              }
            });
            setUsersList(options.sort((a, b) => a.name.localeCompare(b.name, 'th')));
          }
        } catch {
          // ถ้าดึง users ไม่ได้ ไม่ต้อง block การแสดง tasks แค่จะไม่มีชื่อ resolve ให้
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

        setTasks(rawList.map((raw) => normalizeTask(raw, usersMap)));
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
        return 'bg-[var(--redBG)] text-[var(--redText)] border-[var(--redBorder)]';
      case 'ด่วนมาก':
        return 'bg-[var(--orangeBG)] text-[var(--orangeText)] border-[var(--orangeBorder)]';
      case 'ด่วน':
        return 'bg-[var(--yellowBG)] text-[var(--yellowText)] border-[var(--yellowBorder)]';
      case 'ปกติ':
      default:
        return 'bg-[var(--greenBG)] text-[var(--greenText)] border-[var(--greenBorder)]';
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
        year: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // 🔍 กรองข้อมูลตามฟิลด์ที่ตรงกับ DB จริง
  const filteredTasks = useMemo(() => {
    const t = filters.title.trim().toLowerCase();
    const rNo = filters.receive_no.trim();
    const rYear = filters.receive_year.trim();
    const m = filters.memo_no.trim().toLowerCase();
    const s = filters.sender.trim().toLowerCase();
    const status = filters.status.trim();
    const urgency = filters.urgency_level.trim();
    const secret = filters.secret_level.trim();

    // 👥 ผู้รับผิดชอบเลือกได้หลายคน (intersect): งานต้องมี "ครบทุกคน" ที่เลือกไว้ ไม่ใช่แค่คนใดคนหนึ่ง
    // Backend ไม่ส่ง user_id ต่อ assignment มาด้วย (ดู resolveAssigneeName ด้านบน) จึงต้อง match กันด้วย "ชื่อ"
    // ซึ่งปลอดภัยเพราะ users.name เป็น UNIQUE ใน DB (ดู be.md ตาราง users)
    const idToName = new Map(usersList.map((u) => [u.id, u.name]));
    const selectedAssigneeNames = filters.assignees
      .map((id) => idToName.get(id))
      .filter((n): n is string => !!n);

    return tasks.filter((task) => {
      const matchTitle = !t || task.title?.toLowerCase().includes(t);
      const matchReceiveNo = !rNo || task.receive_no?.toString().includes(rNo);
      const matchReceiveYear = !rYear || task.receive_year?.toString().includes(rYear);
      const matchMemo = !m || task.memo_no?.toLowerCase().includes(m);
      const matchSender = !s || task.sender?.toLowerCase().includes(s);
      const matchStatus = !status || task.status === status;
      const matchUrgency = !urgency || task.urgency_level === urgency;
      const matchSecret = !secret || task.secret_level === secret;

      const taskAssigneeNames = (task.assignments || [])
        .map((a) => a.personInCharge || a.role_or_name)
        .filter((n): n is string => !!n);
      const matchAssignee =
        selectedAssigneeNames.length === 0 ||
        selectedAssigneeNames.every((name) => taskAssigneeNames.includes(name));

      return (
        matchTitle &&
        matchReceiveNo &&
        matchReceiveYear &&
        matchMemo &&
        matchSender &&
        matchStatus &&
        matchUrgency &&
        matchSecret &&
        matchAssignee
      );
    });
  }, [tasks, filters, usersList]);

  // ↕️ เรียงข้อมูล: ถ้าไม่มีการเลือกคอลัมน์เอง ใช้ค่าเริ่มต้น receive_year -> receive_no
  const sortedTasks = useMemo(() => {
    const arr = [...filteredTasks];
    const dir = sortConfig.direction === 'asc' ? 1 : -1;

    arr.sort((a, b) => {
      // คอลัมน์ "เลขรับ / ปี" เรียงตามปีก่อนเสมอ แล้วค่อยตามด้วยเลขรับ (ทิศทางเดียวกัน)
      if (sortConfig.key === 'receive_no') {
        const yearDiff = (a.receive_year ?? 0) - (b.receive_year ?? 0);
        if (yearDiff !== 0) return yearDiff * dir;
        return ((a.receive_no ?? 0) - (b.receive_no ?? 0)) * dir;
      }

      const av = getSortValue(a, sortConfig.key);
      const bv = getSortValue(b, sortConfig.key);

      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv, 'th') * dir;
      }
      return ((av as number) - (bv as number)) * dir;
    });

    return arr;
  }, [filteredTasks, sortConfig]);

  // 📄 Pagination: 20 รายการต่อหน้า
  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / PAGE_SIZE));
  const paginatedTasks = useMemo(
    () => sortedTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sortedTasks, currentPage]
  );

  // รีเซ็ตกลับหน้า 1 ทุกครั้งที่ filter หรือ sort เปลี่ยน
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortConfig]);

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">

      <Header filters={filters} setFilters={setFilters} users={usersList} />

      <main className="w-full max-w-[1920px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            title="งานทั้งหมดในระบบ"
            value={tasks.length}
            icon="📁"
          />
          <StatCard
            title="งานด่วน / ด่วนที่สุด"
            value={tasks.filter(t => ['ด่วน', 'ด่วนมาก', 'ด่วนที่สุด'].includes(t.urgency_level)).length}
            icon="⚡"
            valueClass="text-[var(--redText)]"
          />
          <StatCard
            title="กำลังดำเนินการ (Following)"
            value={tasks.filter(t => ['following', 'pending'].includes(t.status)).length}
            icon="⏳"
            valueClass="text-[var(--blueText)]"
          />
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
            tasks={paginatedTasks}
            getUrgencyBadgeStyle={getUrgencyBadgeStyle}
            formatDate={formatDate}
            sortConfig={sortConfig}
            onSort={handleSort}
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedTasks.length}
            onPageChange={setCurrentPage}
            pageSize={PAGE_SIZE}
          />
        )}
      </main>
    </div>
  );
}