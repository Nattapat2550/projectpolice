'use client';

import { useState } from 'react';
import Swal from 'sweetalert2';

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
      setError('กรุณาเลือกไฟล์ Excel ก่อนทำการตรวจสอบ');
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
    
    // 💡 สร้าง Job ID เพื่อติดตามสถานะ
    const jobId = Date.now().toString();
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5003';
    
    // 💡 ตั้ง Interval เพื่อยิงเช็ค Progress ทุกๆ 1 วินาที
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/v1/tasks/upload-progress/${jobId}`);
        const data = await res.json();
        setProgress({ current: data.current, total: data.total });
        if (data.status === 'completed') clearInterval(interval);
      } catch (e) {}
    }, 1000);

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
      setProgress({ current: 0, total: 0 });
    }
  };

  const renderNull = (text = "ไม่มีข้อมูล") => (
    <span className="text-gray-400 italic font-normal text-xs">{text}</span>
  );

  const paginatedData = result?.preview_data?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil((result?.preview_data?.length || 0) / itemsPerPage);

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen bg-gray-50 text-gray-800 dark:bg-[#1a1c23] dark:text-gray-200">
      <div className="mb-8 border-b border-gray-200 dark:border-gray-700 pb-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-blue-600 dark:text-blue-400">
          ระบบนำเข้างานจาก Excel (Tasks)
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          รองรับการดึงข้อมูลจากทุก Sheet (ใช้ชื่อ Sheet เป็นชื่อสำนักงาน) 
        </p>
      </div>

      <form onSubmit={handlePreview} className="mb-8 p-6 bg-white dark:bg-[#252836] border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm max-w-xl">
        <div className="flex flex-col gap-4">
          <label className="font-semibold text-sm text-blue-600 dark:text-blue-400">เลือกไฟล์ Excel ของคุณ (.xlsx, .xls)</label>
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            onChange={handleFileChange}
            className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300 hover:file:opacity-80 border border-gray-300 dark:border-gray-600 p-2 rounded-md bg-transparent cursor-pointer w-full text-sm"
          />
          <button 
            type="submit" 
            disabled={loading || isUploading}
            className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm text-sm"
          >
            {loading ? 'กำลังประมวลผลและอ่านไฟล์...' : 'พรีวิวข้อมูล (ยังไม่บันทึก)'}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 mb-6 bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 rounded-lg text-sm font-medium">
          ⚠️ {error}
        </div>
      )}

      {result && (
        <div className="space-y-6 animate-fadeIn">
          
          <div className="p-6 border rounded-xl bg-white dark:bg-[#252836] shadow-sm border-gray-200 dark:border-gray-700">
             <h3 className="font-bold text-lg mb-2 text-blue-600 dark:text-blue-400">ยืนยันการนำเข้าข้อมูล</h3>
             <p className="text-sm mb-4 text-gray-600 dark:text-gray-400">เมื่อกดปุ่มนี้ ระบบจะเริ่มบันทึกข้อมูลสร้าง Task และผูกผู้ปฏิบัติงานทันที</p>
             
             {/* 💡 ส่วนแสดงผล UI ของ Progress Bar */}
             {isUploading ? (
                 <div className="w-full mt-4">
                     <div className="flex justify-between text-sm mb-1 font-semibold text-blue-600 dark:text-blue-400">
                         <span>กำลังบันทึกลง Database...</span>
                         <span>{progress.current} / {progress.total || result.total_rows} รายการ</span>
                     </div>
                     <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                         <div 
                             className="bg-blue-600 dark:bg-blue-500 h-3 rounded-full transition-all duration-300" 
                             style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                         ></div>
                     </div>
                 </div>
             ) : (
                 <button onClick={handleConfirmUpload} className="w-full bg-green-600 text-white border border-green-700 py-3 px-4 rounded-lg font-bold hover:bg-green-700 transition shadow-md">
                     ยืนยันบันทึกลงฐานข้อมูล ({result.total_rows} รายการ)
                 </button>
             )}
          </div>

          <div>
            <h3 className="font-bold text-xl mb-4">
              🔍 ตารางพรีวิวข้อมูล
            </h3>

            {totalPages > 1 && (
              <div className="flex justify-between items-center bg-white dark:bg-[#252836] p-4 border border-gray-200 dark:border-gray-700 rounded-xl mb-4 shadow-sm">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 text-sm font-medium transition">
                  ก่อนหน้า
                </button>
                <span className="text-sm font-medium">หน้า {currentPage} จาก {totalPages}</span>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 text-sm font-medium transition">
                  ถัดไป
                </button>
              </div>
            )}

            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl shadow-md bg-white dark:bg-[#252836]">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-50 dark:bg-[#1a1c23] font-bold border-b border-gray-200 dark:border-gray-700 text-xs uppercase">
                  <tr>
                    <th className="p-4 border-r dark:border-gray-700 text-center w-24">สำนักงาน (Sheet)</th>
                    <th className="p-4 border-r dark:border-gray-700 text-blue-600 dark:text-blue-400 w-3/5">ข้อมูลที่จะบันทึก</th>
                    <th className="p-4 text-orange-600 dark:text-orange-400 w-2/5">ข้อมูลดิบจาก Excel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedData?.map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                      <td className="p-4 font-bold border-r dark:border-gray-700 text-center align-top">
                        <span className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 py-1 px-2 rounded text-xs whitespace-nowrap">
                          {row.department}
                        </span>
                        <div className="text-xs text-gray-400 mt-2">แถวที่ {row.original_row}</div>
                      </td>
                      <td className="p-4 border-r dark:border-gray-700 align-top">
                        <div className="mb-2">
                            <span className="font-bold text-base text-gray-900 dark:text-gray-100">{row.title || renderNull()}</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-xs mb-3 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                            <div><span className="font-semibold text-gray-500">เลขที่หนังสือ:</span> {row.memo_no || renderNull()}</div>
                            <div><span className="font-semibold text-gray-500">ลงวันที่:</span> {row.memo_date || renderNull()}</div>
                            <div><span className="font-semibold text-gray-500">วันที่รับ:</span> {row.received_date || renderNull()}</div>
                            <div><span className="font-semibold text-gray-500">วันที่ลงนาม:</span> {row.signed_date || renderNull()}</div>
                            <div className="col-span-2"><span className="font-semibold text-gray-500">จาก:</span> {row.sender || renderNull()}</div>
                        </div>

                        <div className="mb-3">
                            <span className="font-semibold text-xs text-gray-500 block mb-1">ข้อสั่งการ:</span>
                            <div className="p-2 text-sm bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 whitespace-pre-wrap">
                                {row.main_text || renderNull()}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <span className="font-semibold text-xs text-gray-500 block">ผู้ปฏิบัติงาน:</span>
                                <span className="text-blue-600 dark:text-blue-400 font-medium">{row.assignee_name || renderNull()}</span>
                            </div>
                            <div>
                                <span className="font-semibold text-xs text-gray-500 block">วันที่/Due Date:</span>
                                <span>{row.due_date_str || renderNull()}</span>
                            </div>
                        </div>

                        {row.notes && (
                            <div className="mt-3 text-xs text-orange-600 dark:text-orange-400">
                                <strong>หมายเหตุ:</strong> {row.notes}
                            </div>
                        )}
                      </td>
                      <td className="p-4 align-top">
                        <pre className="text-xs font-mono bg-gray-50 dark:bg-[#1a1c23] p-3 border border-gray-200 dark:border-gray-700 rounded-lg max-h-64 overflow-y-auto whitespace-pre-wrap">
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
    </div>
  );
}