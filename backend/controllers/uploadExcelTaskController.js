const xlsx = require("xlsx");
const pool = require("../config/db");
const { appendMultipleTasksToSheet, appendTaskToSheet } = require('../services/googleSheetsService');
const { calculateFiscalRoundAndYear } = require("../utils/fiscalYearHelper");
const { syncTaskDocumentNotesFromText } = require("../utils/attachmentSync");

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
                // ถ้าไม่มีวันที่รับ ให้ข้ามแถวนี้ไปเลยตามเงื่อนไข
                if (!receivedDate) return;

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

                const { round, fiscalYear } = calculateFiscalRoundAndYear(receivedDate);
                if (receiveNo) {
                    receiveYear = fiscalYear;
                }

                // ถ้าไม่มีข้อมูลช่อง วันที่ (due date) ให้บวกเพิ่ม 14 วันจาก วันที่รับ (received date) หรือวันที่ปัจจุบัน
                if (!dueDate) {
                    const rDate = receivedDate ? new Date(receivedDate) : new Date();
                    rDate.setDate(rDate.getDate() + 14);
                    dueDate = rDate.getFullYear() + '-' + String(rDate.getMonth() + 1).padStart(2, '0') + '-' + String(rDate.getDate()).padStart(2, '0');
                }

                // ค้นหาฟิลด์ต่างๆ จากคอลัมน์ที่เป็นไปได้ (รองรับภาษาไทยหลายแบบ)
                let excelSender = null;
                let excelRecipientTo = null;
                let excelAdditionalDocs = null;
                let excelMemoNo = null;
                let excelUrgencyLevel = null;
                let excelSecretLevel = null;

                for (const key of Object.keys(row)) {
                    const cleanKey = key.replace(/\s+/g, '');
                    if (cleanKey === "จาก" || cleanKey === "ส่วนราชการ" || cleanKey === "ผู้ส่ง" || cleanKey === "หน่วยงาน" || cleanKey === "หน่วยงานผู้ส่ง") {
                        if (!excelSender) excelSender = row[key] ? String(row[key]).trim() : null;
                    }
                    if (cleanKey === "ถึง" || cleanKey === "เรียน" || cleanKey === "ผู้รับ" || cleanKey === "หน่วยงานรับ") {
                        if (!excelRecipientTo) excelRecipientTo = row[key] ? String(row[key]).trim() : null;
                    }
                    if (cleanKey === "เอกสารข้อมูลเพิ่มเติม" || cleanKey === "สิ่งที่ส่งมาด้วย" || cleanKey === "เอกสารแนบ" || cleanKey === "สิ่งที่ส่งมา") {
                        if (!excelAdditionalDocs) excelAdditionalDocs = row[key] ? String(row[key]).trim() : null;
                    }
                    if (cleanKey === "ที่หนังสือ" || cleanKey === "เลขที่หนังสือ" || cleanKey === "ที่") {
                        if (!excelMemoNo) excelMemoNo = row[key] ? String(row[key]).trim() : null;
                    }
                    if (cleanKey === "ความเร่งด่วน" || cleanKey === "ระดับความเร่งด่วน" || cleanKey === "ชั้นความเร่งด่วน" || cleanKey === "ชั้นความเร็ว") {
                        if (!excelUrgencyLevel) excelUrgencyLevel = row[key] ? String(row[key]).trim() : null;
                    }
                    if (cleanKey === "ความลับ" || cleanKey === "ชั้นความลับ" || cleanKey === "ระดับความลับ") {
                        if (!excelSecretLevel) excelSecretLevel = row[key] ? String(row[key]).trim() : null;
                    }
                }

                const computedUrgency = excelUrgencyLevel || row["ชั้นความเร็ว"] || row["ระดับความเร่งด่วน"] || row["ความเร่งด่วน"] ? String(excelUrgencyLevel || row["ชั้นความเร็ว"] || row["ระดับความเร่งด่วน"] || row["ความเร่งด่วน"]).trim() : "ปกติ";
                const computedSecret = excelSecretLevel || row["ชั้นความลับ"] || row["ความลับ"] ? String(excelSecretLevel || row["ชั้นความลับ"] || row["ความลับ"]).trim() : "ปกติ";

                allData.push({
                    original_row: index + 1,
                    received_date: receivedDate,
                    receive_no: receiveNo,
                    receive_year: receiveYear,
                    round: round,
                    memo_no: excelMemoNo || (row["ที่หนังสือ"] ? String(row["ที่หนังสือ"]).trim() : null),
                    memo_date: parseDateSafe(row["ลงวันที่"]),
                    sender: excelSender || (row["จาก"] ? String(row["จาก"]).trim() : null),
                    recipient_to: excelRecipientTo || (row["ถึง"] || row["เรียน"] ? String(row["ถึง"] || row["เรียน"]).trim() : null),
                    additional_docs: excelAdditionalDocs || (row["เอกสารข้อมูลเพิ่มเติม"] || row["เอกสารแนบ"] || row["สิ่งที่ส่งมาด้วย"] ? String(row["เอกสารข้อมูลเพิ่มเติม"] || row["เอกสารแนบ"] || row["สิ่งที่ส่งมาด้วย"]).trim() : null),
                    title: subject || "ไม่มีชื่องาน",
                    assignee_name: row["ผู้ปฏิบัติ"] ? String(row["ผู้ปฏิบัติ"]).trim() : null,
                    due_date_str: dueDate,
                    main_text: subject || null,
                    command_text: commandTopics, // Send array of topics
                    signed_date: parseDateSafe(row["วันที่ลงนาม"]),
                    meeting_date: parseDateSafe(row["วันประชุม"]),
                    reply_due_date: parseDateSafe(row["กำหนดส่งตอบรับ"]),
                    urgency_level: computedUrgency,
                    secret_level: computedSecret,
                    notes: row["หมายเหตุ"] ? String(row["หมายเหตุ"]).trim() : null,
                    is_urgent: computedUrgency !== "ปกติ" ? true : isUrgent,
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
        const createdTaskIds = [];
        const updatedTaskIds = [];
        
        const CHUNK_SIZE = 500; // Process 500 items at a time for performance

        for (let i = 0; i < allData.length; i += CHUNK_SIZE) {
            const chunk = allData.slice(i, i + CHUNK_SIZE);
            
            try {
                // Step 1: Pre-fetch existing tasks for this chunk
                const conditions = [];
                const params = [];
                let paramIdx = 1;
                
                chunk.forEach(item => {
                    if (item.receive_no && item.receive_year) {
                        conditions.push(`(receive_no = $${paramIdx++} AND receive_year = $${paramIdx++} AND COALESCE(round, 1) = $${paramIdx++})`);
                        params.push(item.receive_no, item.receive_year, item.round || 1);
                    }
                });
                
                let existingMap = {};
                if (conditions.length > 0) {
                    const query = `SELECT id, receive_no, receive_year, COALESCE(round, 1) as round FROM tasks WHERE ${conditions.join(' OR ')}`;
                    const { rows } = await pool.query(query, params);
                    rows.forEach(r => {
                        existingMap[`${r.receive_no}_${r.receive_year}_${r.round}`] = r.id;
                    });
                }

                // Step 2: Separate into inserts and updates
                const toInsert = [];
                const toUpdate = [];

                chunk.forEach(item => {
                    const key = `${item.receive_no}_${item.receive_year}_${item.round || 1}`;
                    if (existingMap[key]) {
                        toUpdate.push({ ...item, id: existingMap[key] });
                    } else {
                        toInsert.push(item);
                    }
                });

                // Step 3: Bulk Insert for new items
                if (toInsert.length > 0) {
                    let valuesPlaceholders = [];
                    let flatValues = [];
                    let counter = 1;

                    toInsert.forEach(item => {
                        let parsedDueDate = item.due_date_str;
                        let parsedMemoDate = item.signed_date || item.memo_date;
                        let parsedCreatedAt = item.received_date || new Date().toISOString();
                        let safeTitle = item.title ? String(item.title) : 'ไม่มีชื่อเรื่อง';
                        let safeMemoNo = item.memo_no ? String(item.memo_no) : null;
                        let safeSender = item.sender ? String(item.sender) : null;
                        let safeTaskDetail = item.command_text && item.command_text.length > 0 ? item.command_text.join('\n') : null;

                        let safeRecipientTo = item.recipient_to ? String(item.recipient_to) : null;
                        let safeAdditionalDocs = item.additional_docs ? String(item.additional_docs) : null;

                        let rowPlaceholders = [];
                        for(let j = 0; j < 21; j++) rowPlaceholders.push(`$${counter++}`);
                        valuesPlaceholders.push(`(${rowPlaceholders.join(', ')})`);
                        
                        flatValues.push(
                            safeTitle, safeMemoNo, parsedMemoDate, item.main_text, item.notes, 
                            safeSender, parsedDueDate, created_by, parsedCreatedAt, safeTaskDetail, item.is_urgent,
                            item.receive_no, item.receive_year, item.round || 1, item.signed_date, 
                            item.meeting_date || null, item.reply_due_date || null, item.urgency_level || 'ปกติ', item.secret_level || 'ปกติ',
                            safeRecipientTo, safeAdditionalDocs
                        );
                    });

                    const taskQuery = `
                        INSERT INTO tasks 
                        (title, memo_no, memo_date, main_text, notes, sender, due_date, created_by, created_at, task_detail, is_urgent, receive_no, receive_year, round, sign_date, meeting_date, reply_due_date, urgency_level, secret_level, recipient_to, additional_docs) 
                        VALUES ${valuesPlaceholders.join(', ')} 
                        RETURNING id
                    `;

                    const taskRes = await pool.query(taskQuery, flatValues);
                    
                    let assignPlaceholders = [];
                    let assignFlatValues = [];
                    let assignCounter = 1;

                    taskRes.rows.forEach((row, idx) => {
                        createdTaskIds.push(row.id);
                        const assignee = toInsert[idx].assignee_name;
                        if (assignee) {
                            assignPlaceholders.push(`($${assignCounter++}, $${assignCounter++})`);
                            assignFlatValues.push(row.id, String(assignee));
                        }
                    });

                    if (assignPlaceholders.length > 0) {
                        await pool.query(`INSERT INTO task_assignments (task_id, role_or_name) VALUES ${assignPlaceholders.join(', ')}`, assignFlatValues);
                    }
                }

                // Step 4: Process Updates concurrently
                if (toUpdate.length > 0) {
                    await Promise.all(toUpdate.map(async (item) => {
                        try {
                            const taskId = item.id;
                            let parsedDueDate = item.due_date_str;
                            let parsedMemoDate = item.signed_date || item.memo_date;
                            let safeTitle = item.title ? String(item.title) : 'ไม่มีชื่อเรื่อง';
                            let safeMemoNo = item.memo_no ? String(item.memo_no) : null;
                            let safeSender = item.sender ? String(item.sender) : null;
                            let safeTaskDetail = item.command_text && item.command_text.length > 0 ? item.command_text.join('\n') : null;

                            let safeRecipientTo = item.recipient_to ? String(item.recipient_to) : null;
                            let safeAdditionalDocs = item.additional_docs ? String(item.additional_docs) : null;

                            await pool.query(
                                `UPDATE tasks SET title = COALESCE($1, title), memo_no = COALESCE($2, memo_no), memo_date = COALESCE($3, memo_date), main_text = COALESCE($4, main_text), notes = COALESCE($5, notes), sender = COALESCE($6, sender), due_date = COALESCE($7, due_date), task_detail = COALESCE($8, task_detail), is_urgent = $9, sign_date = COALESCE($10, sign_date), meeting_date = COALESCE($11, meeting_date), reply_due_date = COALESCE($12, reply_due_date), urgency_level = COALESCE($13, urgency_level), secret_level = COALESCE($14, secret_level), recipient_to = COALESCE($15, recipient_to), additional_docs = COALESCE($16, additional_docs), round = COALESCE($17, round), updated_at = NOW() WHERE id = $18`,
                                [safeTitle, safeMemoNo, parsedMemoDate, item.main_text, item.notes, safeSender, parsedDueDate, safeTaskDetail, item.is_urgent, item.signed_date, item.meeting_date || null, item.reply_due_date || null, item.urgency_level || 'ปกติ', item.secret_level || 'ปกติ', safeRecipientTo, safeAdditionalDocs, item.round || 1, taskId]
                            );
                            if (safeAdditionalDocs !== null) {
                                await syncTaskDocumentNotesFromText(pool, taskId, safeAdditionalDocs);
                            }
                            updatedTaskIds.push(taskId);
                            await pool.query('DELETE FROM task_assignments WHERE task_id = $1', [taskId]);
                            if (item.assignee_name) {
                                await pool.query(`INSERT INTO task_assignments (task_id, role_or_name) VALUES ($1, $2)`, [taskId, String(item.assignee_name)]);
                            }
                        } catch (err) {
                            errors.push(`ข้อผิดพลาดแถวที่ ${item.original_row} (Update): ${err.message}`);
                        }
                    }));
                }

                successCount += chunk.length;
            } catch (err) {
                errors.push(`เกิดข้อผิดพลาดในการประมวลผล Chunk: ${err.message}`);
            }

            processedCount += chunk.length;
            if (jobId && global.uploadProgress[jobId]) {
                global.uploadProgress[jobId].current = Math.min(processedCount, allData.length);
            }
        }

        // Sync to Google Sheets
        try {
            const getFullData = async (ids) => {
                if (ids.length === 0) return [];
                const query = `
                    SELECT t.*, d.drive_web_view_link as document_link,
                    (SELECT string_agg(role_or_name, ', ') FROM task_assignments ta WHERE ta.task_id = t.id) as "personInCharge"
                    FROM tasks t 
                    LEFT JOIN documents d ON t.document_id = d.id
                    WHERE t.id = ANY($1)
                `;
                const { rows } = await pool.query(query, [ids]);
                return rows;
            };

            if (createdTaskIds.length > 0) {
                const createdData = await getFullData(createdTaskIds);
                appendMultipleTasksToSheet(createdData).catch(e => console.error(e));
            }
            if (updatedTaskIds.length > 0) {
                const updatedData = await getFullData(updatedTaskIds);
                for (const row of updatedData) {
                    updateTaskInSheet(row).catch(e => console.error(e));
                }
            }
        } catch (e) {
            console.error("Sheet sync error in uploadExcelTasks", e.message);
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