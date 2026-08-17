'use client';

import { useState } from 'react';
import Link from 'next/link';
import Swal from 'sweetalert2';
import styles from '@/components/self-add/SelfAdd.module.css';
import { getValidExternalUrl } from '@/components/firstpage/TaskTable';

const getUrgencyBadgeStyle = (level?: string) => {
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

const getSecretBadgeStyle = (level?: string) => {
  switch (level) {
    case 'ลับที่สุด':
      return 'bg-[var(--redBG)] text-[var(--redText)] border-[var(--redBorder)]';
    case 'ลับมาก':
      return 'bg-[var(--orangeBG)] text-[var(--orangeText)] border-[var(--orangeBorder)]';
    case 'ลับ':
      return 'bg-[var(--yellowBG)] text-[var(--yellowText)] border-[var(--yellowBorder)]';
    case 'ปกติ':
    default:
      return 'bg-[var(--greenBG)] text-[var(--greenText)] border-[var(--greenBorder)]';
  }
};

const formatToThaiDate = (dateStr?: string | null) => {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;

  // If already DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;

  // If YYYY-MM-DD or YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (ymd) {
    let year = parseInt(ymd[1], 10);
    const yearBE = year < 2400 ? year + 543 : year;
    const m = ymd[2].padStart(2, '0');
    const d = ymd[3].padStart(2, '0');
    return `${d}/${m}/${yearBE}`;
  }

  // If DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    let year = parseInt(dmy[3], 10);
    const yearBE = year < 2400 ? year + 543 : year;
    return `${d}/${m}/${yearBE}`;
  }

  return s;
};

export default function TaskExcelUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  
  // 💡 ตัวแปรสำหรับเก็บ Progress
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setProgress({ current: 0, total: 0 });
      setCurrentPage(1);
    }
  };

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('กรุณาเลือกไฟล์ Excel หรือ Word ก่อนทำการตรวจสอบ');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setProgress({ current: 0, total: 0 });

    const formData = new FormData();
    formData.append('file', file);
    
    const token = localStorage.getItem("token");

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5003';

      const response = await fetch(`${backendUrl}/api/v1/tasks/upload-excel?action=preview`, {
        method: 'POST',
        headers: {
           ...(token && token !== "null" ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
        setCurrentPage(1);
      } else {
        setError(data.message || 'เกิดข้อผิดพลาดในการอ่านไฟล์');
      }
    } catch (err: any) {
      setError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ Backend ได้: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    
    const totalCount = result?.total_rows || result?.preview_data?.length || 1;
    setProgress({ current: 0, total: totalCount });

    // 💡 สร้าง Job ID เพื่อติดตามสถานะ
    const jobId = Date.now().toString();
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5003';
    
    // 💡 ตั้ง Interval เพื่อยิงเช็ค Progress ทุกๆ 500ms
    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${backendUrl}/api/v1/tasks/upload-progress/${jobId}`, {
          headers: {
            ...(token && token !== "null" ? { Authorization: `Bearer ${token}` } : {})
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.current === 'number') {
            setProgress(prev => {
              const newTotal = (data.total && data.total > 0) ? data.total : (prev.total || totalCount);
              const newCurrent = data.current > prev.current ? data.current : prev.current;
              return { current: Math.min(newCurrent, newTotal), total: newTotal };
            });
          }
          if (data.status === 'completed') {
            clearInterval(interval);
          }
        }
      } catch (e) {}
    }, 500);

    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem("token");

    try {
      // 💡 ส่ง Job ID ไปใน Query Parameters
      const response = await fetch(`${backendUrl}/api/v1/tasks/upload-excel?action=upload&jobId=${jobId}`, {
        method: 'POST',
        headers: {
           ...(token && token !== "null" ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData,
      });

      const data = await response.json();
      
      if (data.success) {
        setProgress({ current: totalCount, total: totalCount });
        Swal.fire({
          icon: 'success',
          title: 'อัปโหลดสำเร็จ!',
          text: data.message,
          timer: 2000,
          showConfirmButton: false
        });
        setResult(null);
        setFile(null);
      } else {
        Swal.fire('พบข้อผิดพลาด', data.message, 'error');
        if (data.errors) {
            setError(data.errors.join(", "));
        } else {
            setError(data.message);
        }
      }
    } catch (err: any) {
      setError('ล้มเหลว: ' + err.message);
    } finally {
      clearInterval(interval);
      setIsUploading(false);
    }
  };

  const renderNull = (text = "ไม่มีข้อมูล") => (
    <span className="text-[var(--header)]/40 italic font-normal text-xs sm:text-sm">{text}</span>
  );

  const paginatedData = result?.preview_data?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil((result?.preview_data?.length || 0) / itemsPerPage);

  const displayTotal = progress.total > 0 ? progress.total : (result?.total_rows || 1);
  const displayCurrent = Math.min(progress.current, displayTotal);
  const percent = Math.min(100, Math.round((displayCurrent / displayTotal) * 100));

  return (
    <main className="w-full min-h-screen px-4 sm:px-8 py-6">
      {/* 🧭 Top Navigation Header matching main app & self-add */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className={styles.Header} style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>
            นำเข้างานจากไฟล์ Excel / Word (Tasks)
          </h1>
          <p className="text-[var(--header)]/80 text-base font-medium">
            รองรับการดึงข้อมูลจากทุก Sheet (ใช้ชื่อ Sheet เป็นชื่อหน่วยงาน/ผู้รับผิดชอบ)
          </p>
        </div>

        <Link href="/">
          <button className={styles.SecondaryButton} style={{ padding: '0.5rem 1.25rem', fontSize: '1.05rem' }}>
            กลับหน้าหลัก
          </button>
        </Link>
      </div>

      {/* 📦 File Selection Card Container (Full Width) */}
      <div className={styles.Container} style={{ maxWidth: '100%', width: '100%', marginBottom: '1.5rem', padding: '1.25rem sm:1.5rem' }}>
        <form onSubmit={handlePreview}>
          <div className="flex flex-col gap-4">
            <label className={styles.Label} style={{ fontSize: '1.1rem' }}>
              เลือกไฟล์ Excel หรือ Word (.xlsx, .xls, .docx)
            </label>
            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
              <input 
                type="file" 
                accept=".xlsx, .xls, .docx" 
                onChange={handleFileChange}
                className={styles.Input}
                style={{ padding: '0.65rem 0.85rem', fontSize: '1rem', cursor: 'pointer' }}
              />
              <button 
                type="submit" 
                disabled={loading || isUploading}
                className={styles.SecondaryButton}
                style={{ 
                  color: 'var(--blueText)', 
                  borderColor: 'var(--blueText)', 
                  borderWidth: '2px', 
                  whiteSpace: 'nowrap',
                  padding: '0.65rem 1.5rem',
                  fontSize: '1rem',
                  opacity: (loading || isUploading) ? 0.5 : 1,
                  cursor: (loading || isUploading) ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'กำลังอ่านไฟล์...' : '🔍 พรีวิวข้อมูล (ยังไม่บันทึก)'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {error && (
        <div className="p-4 mb-6 bg-[var(--redBG)]/20 text-[var(--redText)] border-2 border-[var(--redBorder)] rounded-lg text-base font-bold flex items-center gap-2">
          <span>⚠️</span> <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-6 animate-fadeIn w-full">
          
          {/* ⚡ Confirm Upload Section */}
          <div className={styles.AssignmentWrapper} style={{ marginBottom: '1.5rem', border: '2px solid var(--blueText)', padding: '1.25rem' }}>
            <h3 className="font-bold text-xl text-[var(--blueText)] mb-1">ยืนยันการนำเข้าข้อมูลลงฐานข้อมูล</h3>
            <p className="text-sm text-[var(--header)]/80 mb-4 font-medium">
              อ่านข้อมูลได้ทั้งหมด <strong className="text-[var(--blueText)] text-base">{result.total_rows}</strong> รายการ — เมื่อกดยืนยัน ระบบจะเริ่มบันทึกข้อมูลสร้าง Task และผูกผู้ปฏิบัติงานทันที
            </p>

            {isUploading ? (
              <div className="w-full mt-3">
                <div className="flex justify-between text-sm font-bold text-[var(--blueText)] mb-1.5">
                  <span>กำลังบันทึกลง Database...</span>
                  <span>{displayCurrent} / {displayTotal} รายการ ({percent}%)</span>
                </div>
                <div className="w-full bg-[var(--container)] rounded-full h-4 overflow-hidden border border-[var(--wrapper)]">
                  <div className="bg-[var(--blueText)] h-4 rounded-full transition-all duration-300" style={{ width: `${percent}%` }}></div>
                </div>
              </div>
            ) : (
              <button 
                onClick={handleConfirmUpload} 
                className={styles.SubmitButton}
                style={{ marginTop: '0.5rem', fontSize: '1.1rem', padding: '0.85rem' }}
              >
                ✅ ยืนยันบันทึกลงฐานข้อมูล ({result.total_rows} รายการ)
              </button>
            )}
          </div>

          {/* 📊 Preview Data Table Card (Full Width & Enlarged Text) */}
          <div className={styles.Container} style={{ maxWidth: '100%', width: '100%', padding: '1.25rem' }}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <h3 className={styles.Header} style={{ fontSize: '1.4rem', marginBottom: 0 }}>
                🔍 ตารางพรีวิวข้อมูลที่จะนำเข้า
              </h3>

              {totalPages > 1 && (
                <div className="flex items-center gap-3 text-sm font-bold text-[var(--header)]">
                  <button 
                    disabled={currentPage === 1} 
                    onClick={() => setCurrentPage(p => p - 1)} 
                    className={styles.SecondaryButton}
                    style={{ padding: '0.35rem 0.85rem', fontSize: '0.95rem', opacity: currentPage === 1 ? 0.4 : 1 }}
                  >
                    ก่อนหน้า
                  </button>
                  <span>หน้า {currentPage} / {totalPages}</span>
                  <button 
                    disabled={currentPage === totalPages} 
                    onClick={() => setCurrentPage(p => p + 1)} 
                    className={styles.SecondaryButton}
                    style={{ padding: '0.35rem 0.85rem', fontSize: '0.95rem', opacity: currentPage === totalPages ? 0.4 : 1 }}
                  >
                    ถัดไป
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto border-2 border-[var(--wrapper)] rounded-lg w-full">
              <table className="w-full text-sm sm:text-base text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-[var(--wrapper)]/50 text-[var(--header)] font-bold border-b-2 border-[var(--wrapper)] text-sm sm:text-base">
                    <th className="p-4 w-32 sm:w-44 text-center border-r-2 border-[var(--wrapper)] select-none">สำนักงาน (Sheet)</th>
                    <th className="p-4 border-r-2 border-[var(--wrapper)] select-none">ข้อมูลที่จะบันทึก</th>
                    <th className="p-4 w-2/5 select-none">ข้อมูลดิบจาก Excel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--wrapper)] text-sm sm:text-base">
                  {paginatedData?.map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-[var(--wrapper)]/20 transition-colors">
                      {/* 🏢 Sheet Name Column */}
                      <td className="p-4 font-bold border-r-2 border-[var(--wrapper)] text-center align-top text-[var(--header)]">
                        <span className="inline-block px-3 py-1.5 rounded-lg bg-[var(--button)] border border-[var(--wrapper)] text-sm font-bold text-[var(--blueText)] mb-1">
                          {row.sheet_name || '-'}
                        </span>
                        <div className="text-xs text-[var(--header)]/60 font-mono mt-1">แถวที่ {row.original_row}</div>
                      </td>

                      {/* 📋 Processed Task Data Column */}
                      <td className="p-4 border-r-2 border-[var(--wrapper)] align-top text-[var(--header)] space-y-3">
                        <div className="font-bold text-base sm:text-lg text-[var(--header)] pb-2 border-b border-[var(--wrapper)]">
                          {row.title || renderNull()}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-3 border-b border-[var(--wrapper)]">
                          <div className="space-y-1.5">
                            <div className="text-sm sm:text-base"><span className="text-[var(--header)]/60 font-semibold mr-1.5">[เลขที่หนังสือ]</span> <span className="font-bold text-[var(--blueText)]">{row.memo_no || renderNull()}</span></div>
                            <div className="text-sm sm:text-base"><span className="text-[var(--header)]/60 font-semibold mr-1.5">[จาก]</span> <span className="font-semibold">{row.sender || renderNull()}</span></div>
                            <div className="text-sm sm:text-base"><span className="text-[var(--header)]/60 font-semibold mr-1.5">[ถึง]</span> <span className="font-semibold">{row.recipient_to || renderNull()}</span></div>
                            <div className="text-sm sm:text-base"><span className="text-[var(--header)]/60 font-semibold mr-1.5">[วันที่รับ]</span> <span className="font-semibold">{formatToThaiDate(row.received_date) || renderNull()}</span></div>
                            <div className="text-sm sm:text-base"><span className="text-[var(--header)]/60 font-semibold mr-1.5">[ลงวันที่]</span> <span className="font-semibold">{formatToThaiDate(row.memo_date) || renderNull()}</span></div>
                            <div className="text-sm sm:text-base"><span className="text-[var(--header)]/60 font-semibold mr-1.5">[เลขรับ]</span> <span className="font-semibold">{row.receive_no ? `${row.receive_no}/${row.receive_year}` : renderNull()}</span></div>
                            
                            {row.parsed_docs && row.parsed_docs.length > 0 ? (
                              <div className="mt-2 p-3 rounded-lg bg-[var(--wrapper)]/40 border border-[var(--wrapper)]">
                                <span className="font-bold text-sm text-[var(--blueText)] block mb-1">📎 เอกสารข้อมูลเพิ่มเติม ({row.parsed_docs.length} รายการ):</span>
                                <ul className="space-y-1.5 text-xs sm:text-sm">
                                  {row.parsed_docs.map((doc: any, docIdx: number) => (
                                    <li key={docIdx} className="flex items-center flex-wrap gap-1.5">
                                      <span className="font-semibold">• {doc.filename}</span>
                                      {doc.notes && <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--yellowBG)] text-[var(--yellowText)] border border-[var(--yellowBorder)]">หน้า {doc.notes}</span>}
                                      {getValidExternalUrl(doc.link) && (
                                        <a href={getValidExternalUrl(doc.link)!} target="_blank" rel="noopener noreferrer" className="text-[var(--blueText)] underline font-bold ml-1 hover:opacity-80">
                                          [เปิดดูไฟล์]
                                        </a>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : row.additional_docs ? (
                              <div className="mt-2 p-3 rounded-lg bg-[var(--wrapper)]/40 border border-[var(--wrapper)]">
                                <span className="font-bold text-sm text-[var(--blueText)] block mb-1">📎 เอกสารข้อมูลเพิ่มเติม:</span>
                                <div className="text-xs sm:text-sm font-semibold">{row.additional_docs}</div>
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-sm sm:text-base"><span className="text-[var(--header)]/60 font-semibold mr-1.5">[ชั้นความเร็ว]</span> <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-bold border ${getUrgencyBadgeStyle(row.urgency_level)}`}>{row.urgency_level || 'ปกติ'}</span></div>
                            <div className="text-sm sm:text-base"><span className="text-[var(--header)]/60 font-semibold mr-1.5">[ชั้นความลับ]</span> <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-bold border ${getSecretBadgeStyle(row.secret_level)}`}>{row.secret_level || 'ปกติ'}</span></div>
                            <div className="text-sm sm:text-base"><span className="text-[var(--header)]/60 font-semibold mr-1.5">[วันกำหนดส่ง]</span> <span className="font-bold text-[var(--yellowText)]">{formatToThaiDate(row.due_date_str) || renderNull()}</span></div>
                            <div className="text-sm sm:text-base"><span className="text-[var(--header)]/60 font-semibold mr-1.5">[วันประชุม]</span> <span className="font-bold text-[var(--blueText)]">{formatToThaiDate(row.meeting_date) || renderNull()}</span></div>
                            <div className="text-sm sm:text-base"><span className="text-[var(--header)]/60 font-semibold mr-1.5">[กำหนดส่งตอบรับ]</span> <span className="font-bold text-[var(--redText)]">{formatToThaiDate(row.reply_due_date) || renderNull()}</span></div>
                          </div>
                        </div>

                        {row.main_text && (
                          <div className="pb-3 border-b border-[var(--wrapper)]">
                            <span className="font-bold text-sm text-[var(--header)]/70 block mb-1">เนื้อหา:</span>
                            <div className="whitespace-pre-wrap leading-relaxed text-sm sm:text-base text-[var(--header)] font-normal">{row.main_text}</div>
                          </div>
                        )}

                        {row.command_text && row.command_text.length > 0 && (
                          <div className="pb-3 border-b border-[var(--wrapper)]">
                            <span className="font-bold text-sm text-[var(--header)]/70 block mb-1">สิ่งที่ต้องดำเนินการ:</span>
                            <div className="bg-[var(--wrapper)]/30 p-3 rounded-lg border border-[var(--wrapper)]">
                              <ul className="list-disc ml-5 text-[var(--blueText)] font-semibold text-sm sm:text-base space-y-1">
                                {row.command_text.map((cmd: string, cmdIdx: number) => (
                                  <li key={cmdIdx}>{cmd}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}

                        {row.notes && (
                          <div className="text-[var(--redText)] bg-[var(--redBG)]/20 border border-[var(--redBorder)]/40 p-3 rounded-lg font-bold text-sm sm:text-base">
                            <strong>หมายเหตุ:</strong> {row.notes}
                          </div>
                        )}
                      </td>

                      {/* 📄 Raw Excel Data Column */}
                      <td className="p-4 align-top bg-[var(--wrapper)]/10">
                        <pre className="text-xs sm:text-sm font-mono bg-[var(--button)] text-[var(--header)] p-4 border border-[var(--wrapper)] rounded-lg max-h-[450px] overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                          {JSON.stringify(row.raw_data, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}