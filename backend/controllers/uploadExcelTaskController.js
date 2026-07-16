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
        
        const filename = req.file.originalname || "";
        // 1. อ่านไฟล์ด้วย exceljs เพื่อดึงสีตัวอักษร เฉพาะไฟล์ Excel
        const ExcelJS = require('exceljs');
        const excelWorkbook = new ExcelJS.Workbook();
        if (!filename.toLowerCase().endsWith(".docx")) {
            await excelWorkbook.xlsx.load(req.file.buffer);
        }

        const redSubjects = new Set();
        if (!filename.toLowerCase().endsWith(".docx")) {
            excelWorkbook.eachSheet((worksheet) => {
            let subjectCol = -1;
            worksheet.eachRow((row, rowNumber) => {
                if (subjectCol === -1) {
                    row.eachCell((cell, colNumber) => {
                        const val = cell.value ? String(cell.value).trim() : '';
                        if (val === 'เรื่อง') subjectCol = colNumber;
                    });
                } else {
                    const cell = row.getCell(subjectCol);
                    let isRed = false;
                    
                    if (cell.value && cell.value.richText) {
                        isRed = cell.value.richText.some(rt => {
                            if (!rt.font || !rt.font.color) return false;
                            
                            // เช็ค Indexed Color (10 = Red)
                            if (rt.font.color.indexed === 10) return true;
                            
                            if (!rt.font.color.argb) return false;
                            
                            const upper = rt.font.color.argb.toUpperCase();
                            if (upper === 'FFFF0000' || upper === 'FF0000') return true;
                            
                            let offset = upper.length === 8 ? 2 : 0;
                            if (upper.length >= 6) {
                                const r = parseInt(upper.substring(offset, offset + 2), 16);
                                const g = parseInt(upper.substring(offset + 2, offset + 4), 16);
                                const b = parseInt(upper.substring(offset + 4, offset + 6), 16);
                                if (r > 150 && g < 100 && b < 100) return true;
                            }
                            return false;
                        });
                    } else if (cell.font && cell.font.color) {
                        if (cell.font.color.indexed === 10) isRed = true;
                        else if (cell.font.color.argb) {
                            const upper = cell.font.color.argb.toUpperCase();
                            if (upper === 'FFFF0000' || upper === 'FF0000') isRed = true;
                            else {
                                let offset = upper.length === 8 ? 2 : 0;
                                if (upper.length >= 6) {
                                    const r = parseInt(upper.substring(offset, offset + 2), 16);
                                    const g = parseInt(upper.substring(offset + 2, offset + 4), 16);
                                    const b = parseInt(upper.substring(offset + 4, offset + 6), 16);
                                    if (r > 150 && g < 100 && b < 100) isRed = true;
                                }
                            }
                        }
                    }
                    
                    if (isRed) {
                        let textValue = cell.value;
                        if (textValue && textValue.richText) {
                            textValue = textValue.richText.map(rt => rt.text).join('');
                        }
                        if (textValue) {
                            redSubjects.add(String(textValue).trim());
                        }
                    }
                }
            });
        });
        }

        // อ่านไฟล์ Excel หรือ Word จาก Buffer ด้วย xlsx เพื่อดึงข้อมูลดิบ
        let workbook;
        if (filename.toLowerCase().endsWith(".docx")) {
            const mammoth = require("mammoth");
            const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
            workbook = xlsx.read(result.value, { type: "string" });
        } else {
            workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        }
        
        let allData = [];

        const parseDateSafe = (d) => {
            if (!d) return null;
            
            // Handle Excel serial date numbers (e.g. 45488 -> 2024-07-15, 244460 -> 2569-04-21)
            const num = Number(d);
            let dateObj;
            if (!isNaN(num) && num > 20000 && num < 300000) {
                dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
            } else {
                const t = Date.parse(d);
                if (isNaN(t)) return null;
                dateObj = new Date(t);
            }

            let year = dateObj.getFullYear();
            
            // Convert Buddhist Era to AD
            if (year >= 2500 && year <= 2650) {
                year -= 543;
            }
            // Reject absurd years
            if (year < 1900 || year > 2150) {
                return null;
            }
            
            return year + '-' + String(dateObj.getMonth()+1).padStart(2, '0') + '-' + String(dateObj.getDate()).padStart(2, '0');
        };

        workbook.SheetNames.forEach(sheetName => {
            const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
            
            rawData.forEach((row, index) => {
                if (!row["เรื่อง"] && !row["ที่หนังสือ"] && !row["ข้อสั่งการ"]) return;

                const subject = row["เรื่อง"] ? String(row["เรื่อง"]).trim() : "";
                
                // ถ้าไม่มีเรื่อง (subject ว่างหรือเป็น null) ให้คัดออกเลย
                if (!subject) return;

                // นำเข้าข้อมูลปกติ ไม่ผูกมัดสีแดงกับงานด่วน
                const isUrgent = false;

                const command = row["ข้อสั่งการ"] ? String(row["ข้อสั่งการ"]).trim() : "";
                
                // แยกย่อยข้อสั่งการด้วยการขึ้นบรรทัดใหม่
                const commandTopics = command 
                    ? command.split(/\r?\n/).map(c => c.trim()).filter(c => c.length > 0)
                    : [];

                let receivedDate = parseDateSafe(row["วันที่รับ"]);
                let dueDate = parseDateSafe(row["วันที่"]);
                
                // ค้นหาเลขรับ (Registration Number) จากคอลัมน์ที่เป็นไปได้
                let receiveNoInput = null;
                for (const key of Object.keys(row)) {
                    const cleanKey = key.replace(/\s+/g, '');
                    if (cleanKey === "เลขทะเบียน" || cleanKey === "ทะเบียนรับ" || cleanKey === "ทะเบียน" || cleanKey === "เลขรับ" || cleanKey === "ที่") {
                        receiveNoInput = row[key];
                        break;
                    }
                }
                
                let receiveNo = null;
                let receiveYear = null;
                if (receiveNoInput) {
                    if (typeof receiveNoInput === 'string') {
                        const thaiNumerals = { '๐':'0', '๑':'1', '๒':'2', '๓':'3', '๔':'4', '๕':'5', '๖':'6', '๗':'7', '๘':'8', '๙':'9' };
                        receiveNoInput = receiveNoInput.replace(/[๐-๙]/g, match => thaiNumerals[match]);
                    }
                    // ค้นหาตัวเลขแรกที่พบในข้อความ เผื่อมีตัวอักษรนำหน้า
                    const matchNum = String(receiveNoInput).match(/\d+/);
                    const parsedNum = matchNum ? parseInt(matchNum[0], 10) : NaN;
                    receiveNo = isNaN(parsedNum) ? null : parsedNum;
                }
                if (receiveNo) {
                    receiveYear = receivedDate ? new Date(receivedDate).getFullYear() : new Date().getFullYear();
                }

                // ถ้าไม่มีข้อมูลช่อง วันที่ (due date) ให้บวกเพิ่ม 14 วันจาก วันที่รับ (received date)
                if (!dueDate && receivedDate) {
                    const rDate = new Date(receivedDate);
                    rDate.setDate(rDate.getDate() + 14);
                    dueDate = rDate.getFullYear() + '-' + String(rDate.getMonth() + 1).padStart(2, '0') + '-' + String(rDate.getDate()).padStart(2, '0');
                }

                allData.push({
                    original_row: index + 1,
                    received_date: receivedDate,
                    receive_no: receiveNo,
                    receive_year: receiveYear,
                    memo_no: row["ที่หนังสือ"] ? String(row["ที่หนังสือ"]).trim() : null,
                    memo_date: parseDateSafe(row["ลงวันที่"]),
                    sender: row["จาก"] ? String(row["จาก"]).trim() : null,
                    title: subject || "ไม่มีชื่องาน",
                    assignee_name: row["ผู้ปฏิบัติ"] ? String(row["ผู้ปฏิบัติ"]).trim() : null,
                    due_date_str: dueDate,
                    main_text: subject || null,
                    command_text: commandTopics, // Send array of topics
                    signed_date: parseDateSafe(row["วันที่ลงนาม"]),
                    notes: row["หมายเหตุ"] ? String(row["หมายเหตุ"]).trim() : null,
                    is_urgent: isUrgent,
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
                    let parsedMemoDate = item.signed_date || item.memo_date;
                    let parsedCreatedAt = item.received_date || new Date().toISOString();

                    let safeTitle = item.title ? String(item.title) : 'ไม่มีชื่อเรื่อง';
                    let safeMemoNo = item.memo_no ? String(item.memo_no) : null;
                    let safeSender = item.sender ? String(item.sender) : null;

                    let safeTaskDetail = item.command_text && item.command_text.length > 0 ? item.command_text.join('\n') : null;

                    let rowPlaceholders = [];
                    for(let j = 0; j < 13; j++) {
                        rowPlaceholders.push(`$${counter++}`);
                    }
                    valuesPlaceholders.push(`(${rowPlaceholders.join(', ')})`);
                    
                    flatValues.push(
                        safeTitle, safeMemoNo, parsedMemoDate, item.main_text, item.notes, 
                        safeSender, parsedDueDate, created_by, parsedCreatedAt, safeTaskDetail, item.is_urgent,
                        item.receive_no, item.receive_year
                    );
                });

                // 1. Bulk Insert ลงตาราง tasks
                const taskQuery = `
                    INSERT INTO tasks 
                    (title, memo_no, memo_date, main_text, notes, sender, due_date, created_by, created_at, task_detail, is_urgent, receive_no, receive_year) 
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
                        RETURNING id
                    `;
                    const assignRes = await pool.query(assignQuery, assignFlatValues);
                }

                successCount += chunk.length;

            } catch (err) {
                // Fallback: ถ้า Bulk Insert รหัสไหนมีปัญหา ให้ทำการ Insert ทีละแถวแบบเดิม (เพื่อไม่ให้เสียแถวอื่นที่ปกติ)
                for (let k = 0; k < chunk.length; k++) {
                    const item = chunk[k];
                    try {
                        const fallbackTaskQuery = `
                            INSERT INTO tasks 
                            (title, memo_no, memo_date, main_text, notes, sender, receive_date, sign_date, due_date, created_by, task_detail, receive_no, receive_year) 
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id
                        `;
                        const parsedDueDate = item.due_date_str;
                        const parsedMemoDate = item.memo_date;
                        const parsedReceivedDate = item.received_date;
                        const parsedSignedDate = item.signed_date;
                        
                        const safeTitle = item.title ? String(item.title) : 'ไม่มีชื่อเรื่อง';
                        const safeMemoNo = item.memo_no ? String(item.memo_no) : null;
                        const safeSender = item.sender ? String(item.sender) : null;

                        const safeTaskDetail = item.command_text && item.command_text.length > 0 ? item.command_text.join('\n') : null;

                        const fallbackValues = [
                            safeTitle, safeMemoNo, parsedMemoDate, item.main_text, item.notes, 
                            safeSender, parsedReceivedDate, parsedSignedDate, parsedDueDate, created_by, safeTaskDetail,
                            item.receive_no, item.receive_year
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