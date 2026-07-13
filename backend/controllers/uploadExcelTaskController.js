const xlsx = require("xlsx");
const pool = require("../config/db");

// สร้างตัวแปร Global สำหรับเก็บ Progress 
if (!global.uploadProgress) { 
    global.uploadProgress = {}; 
}

// 💡 ฟังก์ชันใหม่สำหรับส่ง Progress กลับไปให้ Frontend
exports.getUploadProgress = (req, res) => {
    const jobId = req.params.jobId;
    res.json(global.uploadProgress[jobId] || { current: 0, total: 0, status: 'pending' });
};

exports.uploadExcelTasks = async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: "กรุณาแนบไฟล์ Excel" });
        }

        const action = req.query.action || "upload";
        const jobId = req.query.jobId; // รับ Job ID มาเพื่อทำ Progress
        
        // อ่านไฟล์ Excel จาก Buffer
        const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        
        let allData = [];

        const parseDateSafe = (d) => {
            if (!d) return null;
            
            // Handle Excel serial date numbers (e.g. 45488 -> 2024-07-15)
            const num = Number(d);
            if (!isNaN(num) && num > 20000 && num < 100000) {
                const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
                return dateObj.getFullYear() + '-' + String(dateObj.getMonth()+1).padStart(2, '0') + '-' + String(dateObj.getDate()).padStart(2, '0');
            }

            const t = Date.parse(d);
            if (isNaN(t)) return null;
            const dateObj = new Date(t);
            return dateObj.getFullYear() + '-' + String(dateObj.getMonth()+1).padStart(2, '0') + '-' + String(dateObj.getDate()).padStart(2, '0');
        };

        workbook.SheetNames.forEach(sheetName => {
            const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
            
            rawData.forEach((row, index) => {
                if (!row["เรื่อง"] && !row["ที่หนังสือ"] && !row["ข้อสั่งการ"]) return;

                allData.push({
                    original_row: index + 1,
                    department: sheetName,
                    received_date: parseDateSafe(row["วันที่รับ"]),
                    memo_no: row["ที่หนังสือ"] ? String(row["ที่หนังสือ"]).trim() : null,
                    memo_date: parseDateSafe(row["ลงวันที่"]),
                    sender: row["จาก"] ? String(row["จาก"]).trim() : null,
                    title: row["เรื่อง"] ? String(row["เรื่อง"]).trim() : "ไม่มีชื่อเรื่อง",
                    assignee_name: row["ผู้ปฏิบัติ"] ? String(row["ผู้ปฏิบัติ"]).trim() : null,
                    due_date_str: parseDateSafe(row["วันที่"]),
                    main_text: row["ข้อสั่งการ"] ? String(row["ข้อสั่งการ"]).trim() : null,
                    signed_date: parseDateSafe(row["วันที่ลงนาม"]),
                    notes: row["หมายเหตุ"] ? String(row["หมายเหตุ"]).trim() : null,
                    raw_data: row
                });
            });
        });

        // 🟢 โหมดพรีวิว (ส่งข้อมูลกลับไปแสดงผล)
        if (action === "preview") {
            return res.status(200).json({ 
                success: true, 
                message: "ดึงข้อมูลพรีวิวสำเร็จ",
                total_rows: allData.length, 
                preview_data: allData 
            });
        }

        // 🔵 โหมดบันทึกจริง (Upload)
        const created_by = req.user ? req.user.id : null;
        let successCount = 0;
        let errors = [];

        // ตั้งค่า Progress เริ่มต้น
        if (jobId) {
            global.uploadProgress[jobId] = { current: 0, total: allData.length, status: 'processing' };
        }

        let processedCount = 0;
        const CHUNK_SIZE = 1000; // สร้างชุดคำสั่ง Bulk Insert ทีละ 1,000 แถว
        
        for (let i = 0; i < allData.length; i += CHUNK_SIZE) {
            const chunk = allData.slice(i, i + CHUNK_SIZE);
            try {
                let valuesPlaceholders = [];
                let flatValues = [];
                let counter = 1;

                chunk.forEach(item => {
                    let parsedDueDate = item.due_date_str;
                    let parsedMemoDate = item.memo_date;
                    let parsedReceivedDate = item.received_date;
                    let parsedSignedDate = item.signed_date;

                    let safeTitle = item.title ? String(item.title) : 'ไม่มีชื่อเรื่อง';
                    let safeMemoNo = item.memo_no ? String(item.memo_no) : null;
                    let safeDept = item.department ? String(item.department) : null;
                    let safeSender = item.sender ? String(item.sender) : null;

                    let rowPlaceholders = [];
                    for(let j = 0; j < 11; j++) {
                        rowPlaceholders.push(`$${counter++}`);
                    }
                    valuesPlaceholders.push(`(${rowPlaceholders.join(', ')})`);
                    
                    flatValues.push(
                        safeTitle, safeMemoNo, parsedMemoDate, item.main_text, item.notes, 
                        safeDept, safeSender, parsedReceivedDate, parsedSignedDate, parsedDueDate, created_by
                    );
                });

                // 1. Bulk Insert ลงตาราง tasks
                const taskQuery = `
                    INSERT INTO tasks 
                    (title, memo_no, memo_date, main_text, notes, department, sender, received_date, signed_date, due_date, created_by) 
                    VALUES ${valuesPlaceholders.join(', ')} 
                    RETURNING id
                `;

                const taskRes = await pool.query(taskQuery, flatValues);
                
                // 2. เตรียมข้อมูล Bulk Insert ลงตาราง task_assignments
                let assignPlaceholders = [];
                let assignFlatValues = [];
                let assignCounter = 1;

                taskRes.rows.forEach((row, index) => {
                    const assignee = chunk[index].assignee_name;
                    if (assignee) {
                        assignPlaceholders.push(`($${assignCounter++}, $${assignCounter++})`);
                        assignFlatValues.push(row.id, String(assignee));
                    }
                });

                if (assignPlaceholders.length > 0) {
                    const assignQuery = `
                        INSERT INTO task_assignments (task_id, role_or_name)
                        VALUES ${assignPlaceholders.join(', ')}
                    `;
                    await pool.query(assignQuery, assignFlatValues);
                }

                successCount += chunk.length;

            } catch (err) {
                // Fallback: ถ้า Bulk Insert รหัสไหนมีปัญหา ให้ทำการ Insert ทีละแถวแบบเดิม (เพื่อไม่ให้เสียแถวอื่นที่ปกติ)
                for (let k = 0; k < chunk.length; k++) {
                    const item = chunk[k];
                    try {
                        const fallbackTaskQuery = `
                            INSERT INTO tasks 
                            (title, memo_no, memo_date, main_text, notes, department, sender, received_date, signed_date, due_date, created_by) 
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id
                        `;
                        const parsedDueDate = item.due_date_str;
                        const parsedMemoDate = item.memo_date;
                        const parsedReceivedDate = item.received_date;
                        const parsedSignedDate = item.signed_date;
                        
                        const safeTitle = item.title ? String(item.title) : 'ไม่มีชื่อเรื่อง';
                        const safeMemoNo = item.memo_no ? String(item.memo_no) : null;
                        const safeDept = item.department ? String(item.department) : null;
                        const safeSender = item.sender ? String(item.sender) : null;

                        const fallbackValues = [
                            safeTitle, safeMemoNo, parsedMemoDate, item.main_text, item.notes, 
                            safeDept, safeSender, parsedReceivedDate, parsedSignedDate, parsedDueDate, created_by
                        ];
                        
                        const tRes = await pool.query(fallbackTaskQuery, fallbackValues);
                        
                        if (item.assignee_name) {
                            const assignQuery = `
                                INSERT INTO task_assignments (task_id, role_or_name)
                                VALUES ($1, $2)
                            `;
                            await pool.query(assignQuery, [tRes.rows[0].id, String(item.assignee_name)]);
                        }
                        successCount++;
                    } catch (fallbackErr) {
                        errors.push(`ข้อผิดพลาดแถวที่ ${item.original_row}: ${fallbackErr.message}`);
                    }
                }
            }

            processedCount += chunk.length;
            if (jobId && global.uploadProgress[jobId]) {
                global.uploadProgress[jobId].current = Math.min(processedCount, allData.length);
            }
        }

        // เมื่อทำงานเสร็จ เปลี่ยนสถานะเป็น completed
        if (jobId && global.uploadProgress[jobId]) {
            global.uploadProgress[jobId].status = 'completed';
        }

        if (successCount === 0 && allData.length > 0) {
            return res.status(400).json({
                success: false,
                message: `ไม่สามารถบันทึกข้อมูลได้เลย: ${errors[0] || 'เกิดข้อผิดพลาด'}`
            });
        }

        res.status(200).json({
            success: true,
            message: `บันทึกข้อมูลสำเร็จ ${successCount} จาก ${allData.length} รายการ`,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error("Excel Upload Error:", error);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด: " + error.message });
    }
};