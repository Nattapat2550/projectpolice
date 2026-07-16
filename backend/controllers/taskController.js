const pool = require('../config/db');
const fs = require('fs').promises;
const path = require('path'); // เพิ่ม module path สำหรับป้องกัน Path Traversal
const { uploadToDrive } = require('../services/googleDriveService');
const { generateHash } = require('../utils/duplicateChecker');

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID; 
// กำหนดโฟลเดอร์สำหรับเก็บไฟล์ชั่วคราวให้ชัดเจน (แก้ไข path ให้ตรงกับที่ตั้งโฟลเดอร์ uploads ของคุณ)
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads'); 

// Helper function to validate UUID
const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof uuid === 'string' && uuidRegex.test(uuid);
};

// Helper function to parse Thai date string into YYYY-MM-DD
const parseThaiDateToIso = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  // If it's already in YYYY-MM-DD format, return it
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return dateStr.trim();
  
  // Convert Thai numerals to Arabic numerals
  const thaiNumerals = { '๐':'0', '๑':'1', '๒':'2', '๓':'3', '๔':'4', '๕':'5', '๖':'6', '๗':'7', '๘':'8', '๙':'9' };
  let normalizedStr = dateStr.replace(/[๐-๙]/g, match => thaiNumerals[match]);
  
  const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const thaiMonthsAbbr = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  
  const regex = /(\d{1,2})\s*(.+?)\s*(\d{4})/;
  const match = normalizedStr.match(regex);
  
  if (!match) return null;
  
  const day = parseInt(match[1]).toString().padStart(2, '0');
  const monthStr = match[2].trim();
  let year = parseInt(match[3]);
  
  if (year > 2400) year -= 543;
  
  let monthIndex = thaiMonths.findIndex(m => m === monthStr);
  if (monthIndex === -1) monthIndex = thaiMonthsAbbr.findIndex(m => m === monthStr);
  if (monthIndex === -1) monthIndex = thaiMonths.findIndex(m => monthStr.includes(m));
  
  if (monthIndex === -1) return null;
  
  const month = (monthIndex + 1).toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

// Helper function to log task actions
const logTaskAction = async (clientOrPool, taskId, userId, action, details) => {
  try {
    if (!taskId) return;
    await clientOrPool.query(
      `INSERT INTO task_logs (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)`,
      [taskId, userId || null, action, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error("Error logging task action:", err.message);
  }
};

// Helper function to handle receive_no and receive_year logic
const handleReceiveNoAndYear = async (client, inputReceiveNo, parsedReceiveDate) => {
    let receiveNoInput = inputReceiveNo;
    if (typeof receiveNoInput === 'string') {
        const thaiNumerals = { '๐':'0', '๑':'1', '๒':'2', '๓':'3', '๔':'4', '๕':'5', '๖':'6', '๗':'7', '๘':'8', '๙':'9' };
        receiveNoInput = receiveNoInput.replace(/[๐-๙]/g, match => thaiNumerals[match]);
    }
    
    let receiveNo = parseInt(receiveNoInput, 10) || null;
    let receiveYear = parsedReceiveDate ? new Date(parsedReceiveDate).getFullYear() : new Date().getFullYear();

    if (!receiveNo) {
        // Generate new sequential number for this year
        const res = await client.query('SELECT MAX(receive_no) as max_no FROM tasks WHERE receive_year = $1', [receiveYear]);
        receiveNo = (res.rows[0].max_no || 0) + 1;
    }
    return { receiveNo, receiveYear };
};

exports.getAllTasks = async (req, res) => {
  try {
    const query = `
      WITH unique_assignees AS (
        SELECT DISTINCT 
          ta.task_id, 
          COALESCE(u.name, ta.role_or_name) AS name, 
          COALESCE(u.color, '#e5e7eb') AS color
        FROM task_assignments ta
        LEFT JOIN users u ON ta.user_id = u.id
        WHERE COALESCE(u.name, ta.role_or_name) IS NOT NULL
      ),
      agg_assignees AS (
        SELECT 
          task_id,
          STRING_AGG(name, ', ') AS "personInCharge",
          JSON_AGG(json_build_object('name', name, 'color', color)) AS "assigneesData"
        FROM unique_assignees
        GROUP BY task_id
      )
      SELECT 
        t.id AS id, 
        t.title AS name, 
        COALESCE(aa."personInCharge", 'ไม่ระบุ') AS "personInCharge", 
        COALESCE(aa."assigneesData", '[]'::json) AS "assigneesData",
        TO_CHAR(t.due_date, 'YYYY-MM-DD') AS date, 
        t.created_at AS "createdAt",
        t.status,
        t.is_urgent AS "isUrgent",
        t.urgency_level,
        t.secret_level,
        t.meeting_date,
        t.reply_due_date,
        t.receive_no,
        t.receive_year
      FROM tasks t
      LEFT JOIN agg_assignees aa ON t.id = aa.task_id
      ORDER BY t.due_date ASC NULLS LAST
    `;
    const { rows } = await pool.query(query);
    res.status(200).json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getUrgentTasks = async (req, res) => {
  try {
    const query = `
      WITH unique_assignees AS (
        SELECT DISTINCT 
          ta.task_id, 
          COALESCE(u.name, ta.role_or_name) AS name, 
          COALESCE(u.color, '#e5e7eb') AS color
        FROM task_assignments ta
        LEFT JOIN users u ON ta.user_id = u.id
        WHERE COALESCE(u.name, ta.role_or_name) IS NOT NULL
      ),
      agg_assignees AS (
        SELECT 
          task_id,
          STRING_AGG(name, ', ') AS "personInCharge",
          JSON_AGG(json_build_object('name', name, 'color', color)) AS "assigneesData"
        FROM unique_assignees
        GROUP BY task_id
      )
      SELECT 
        t.id AS id, 
        t.title AS name, 
        COALESCE(aa."personInCharge", 'ไม่ระบุ') AS "personInCharge", 
        COALESCE(aa."assigneesData", '[]'::json) AS "assigneesData",
        TO_CHAR(t.due_date, 'YYYY-MM-DD') AS date, 
        t.created_at AS "createdAt",
        t.status,
        t.is_urgent AS "isUrgent",
        t.urgency_level,
        t.secret_level,
        t.meeting_date,
        t.reply_due_date,
        t.receive_no,
        t.receive_year
      FROM tasks t
      LEFT JOIN agg_assignees aa ON t.id = aa.task_id
      WHERE t.is_urgent = true
      ORDER BY t.due_date ASC NULLS LAST
    `;
    const { rows } = await pool.query(query);
    res.status(200).json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await pool.query(
      `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Task not found' });
    
    // Log the action
    await logTaskAction(pool, id, req.user?.id, 'updated_status', { new_status: status });

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Update status error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.confirmTasks = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { fileInfo, memos, createdBy } = req.body;
    const validCreatorId = isValidUUID(createdBy) ? createdBy : null;
    let documentId = null;

    if (fileInfo && fileInfo.path) {
      // 🔒 Snyk Fix (CWE-22): ทำความสะอาด path ที่รับมาจาก Frontend 
      const safeFileName = path.basename(fileInfo.path);
      const safePath = path.join(process.cwd(), 'uploads', safeFileName);
      
      // บังคับเปลี่ยน path เป็นอันที่ปลอดภัย
      fileInfo.path = safePath;

      const driveData = await uploadToDrive(
        { path: fileInfo.path, originalname: fileInfo.originalname, mimetype: fileInfo.mimetype },
        DRIVE_FOLDER_ID
      );

      const hash = generateHash(fileInfo.text + Date.now().toString());

      const docRes = await client.query(
        `INSERT INTO documents (filename, content, content_hash, keywords_found, drive_file_id, drive_web_view_link, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          fileInfo.originalname,
          fileInfo.text,
          hash,
          JSON.stringify({ memos }), 
          driveData.id,
          driveData.webViewLink,
          validCreatorId
        ]
      );
      documentId = docRes.rows[0].id;
    }

    if (Array.isArray(memos) && memos.length > 0) {
      for (const memo of memos) {
          const parsedMemoDate = parseThaiDateToIso(memo.วันที่) || null;
          const parsedSignDate = parseThaiDateToIso(memo.sign_date) || null;
          const parsedReceiveDate = parseThaiDateToIso(memo.receive_date) || null;

          const parsedMeetingDate = parseThaiDateToIso(memo.meeting_date) || null;
          const parsedReplyDueDate = parseThaiDateToIso(memo.reply_due_date) || null;

          let finalDueDate = memo.due_date || null;
          if (parsedMeetingDate) {
              finalDueDate = parsedMeetingDate;
          }

          const { receiveNo, receiveYear } = await handleReceiveNoAndYear(client, memo.receive_no, parsedReceiveDate);

          const existingRes = await client.query('SELECT id FROM tasks WHERE receive_no = $1 AND receive_year = $2', [receiveNo, receiveYear]);
          let taskId;
          
          if (existingRes.rows.length > 0) {
              taskId = existingRes.rows[0].id;
              await client.query(
                  `UPDATE tasks SET document_id = COALESCE($1, document_id), title = $2, memo_no = $3, memo_date = $4, main_text = $5, task_detail = $6, due_date = COALESCE($7, due_date), is_urgent = $8, urgency_level = $9, secret_level = $10, sign_date = $11, meeting_date = $13, reply_due_date = $14, created_at = COALESCE(CAST($12 AS timestamp), created_at), updated_at = NOW() WHERE id = $15`,
                  [documentId, memo.เรื่อง || 'ไม่ระบุชื่อเรื่อง', memo.ที่, parsedMemoDate, memo.main_text, memo.task_detail || null, finalDueDate, memo.isUrgent || false, memo.urgency_level || null, memo.secret_level || null, parsedSignDate, parsedReceiveDate, parsedMeetingDate, parsedReplyDueDate, taskId]
              );
              await logTaskAction(client, taskId, validCreatorId, 'updated_task', { source: 'confirm_tasks_upsert' });
              await client.query('DELETE FROM task_assignments WHERE task_id = $1', [taskId]);
          } else {
              const taskRes = await client.query(
                `INSERT INTO tasks (document_id, title, memo_no, memo_date, main_text, task_detail, due_date, is_urgent, created_by, urgency_level, secret_level, sign_date, meeting_date, reply_due_date, receive_no, receive_year, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $14, $15, $16, $17, COALESCE(CAST($13 AS timestamp), NOW())) RETURNING id`,
                [ 
                  documentId, 
                  memo.เรื่อง || 'ไม่ระบุชื่อเรื่อง', 
                  memo.ที่, 
                  parsedMemoDate, 
                  memo.main_text, 
                  memo.task_detail || null,
                  finalDueDate,
                  memo.isUrgent || false,
                  validCreatorId,
                  memo.urgency_level || null,
                  memo.secret_level || null,
                  parsedSignDate,
                  parsedReceiveDate,
                  parsedMeetingDate,
                  parsedReplyDueDate,
                  receiveNo,
                  receiveYear
                ]
              );
              taskId = taskRes.rows[0].id;
              await logTaskAction(client, taskId, validCreatorId, 'created_task', { source: 'confirm_tasks' });
          }
        

        if (Array.isArray(memo.assignments) && memo.assignments.length > 0) {
          for (const assign of memo.assignments) {
            const userId = isValidUUID(assign.user_id) ? assign.user_id : null; 
            const personStr = assign.responsible_person || '';

            const assignRes = await client.query(
              `INSERT INTO task_assignments (task_id, user_id, role_or_name)
               VALUES ($1, $2, $3) RETURNING id`,
              [taskId, userId, personStr]
            );
            const assignmentId = assignRes.rows[0].id;
            
            await logTaskAction(client, taskId, validCreatorId, 'assigned_user', { user_id: userId, role_or_name: personStr });
          }
        }
      }
    }
    
    await client.query('COMMIT');

    if (fileInfo && fileInfo.path) {
      try { await fs.unlink(fileInfo.path); } catch (e) { console.error("Warning: Cannot delete temp file", e.message); }
    }

    res.status(200).json({ success: true, message: 'บันทึกเอกสารและงานติดตามสำเร็จเรียบร้อย!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Confirm error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  } finally {
    client.release();
  }
};

exports.updateTaskDetail = async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { id } = req.params;
      const { name, date, notes, assignments, isUrgent, main_text, task_detail, urgency_level, secret_level, receive_date, sign_date, meeting_date, reply_due_date, receive_no } = req.body;
  
      const validDate = (date === "" || !date) ? null : date;
      const urgentValue = isUrgent !== undefined ? isUrgent : null; 
  
      await client.query(
        `UPDATE tasks 
         SET title = COALESCE($1, title), 
             due_date = COALESCE($2, due_date), 
             notes = COALESCE($3, notes), 
             is_urgent = COALESCE($4, is_urgent),
             main_text = COALESCE($5, main_text),
             task_detail = COALESCE($6, task_detail),
             urgency_level = COALESCE($7, urgency_level),
             secret_level = COALESCE($8, secret_level),
             created_at = COALESCE(CAST($9 AS timestamp), created_at),
             sign_date = COALESCE($10, sign_date),
             meeting_date = COALESCE($11, meeting_date),
             reply_due_date = COALESCE($12, reply_due_date),
             receive_no = COALESCE($13, receive_no),
             updated_at = NOW() 
         WHERE id = $14`,
        [name, validDate, notes, urgentValue, main_text, task_detail, urgency_level, secret_level, receive_date, sign_date, meeting_date, reply_due_date, receive_no, id]
      );

    if (Array.isArray(assignments)) {
      const keepAssignmentIds = assignments
        .map(a => a.assignment_id)
        .filter(id => id != null && id !== '');

      if (keepAssignmentIds.length > 0) {
        const deletedAssigns = await client.query(
          `SELECT id FROM task_assignments WHERE task_id = $1 AND NOT (id = ANY($2::uuid[]))`,
          [id, keepAssignmentIds]
        );
        const delIds = deletedAssigns.rows.map(r => r.id);
        
        if (delIds.length > 0) {
          await client.query(`DELETE FROM task_assignments WHERE task_id = $1 AND NOT (id = ANY($2::uuid[]))`, [id, keepAssignmentIds]);
        }
      } else {
        const allAssigns = await client.query(`SELECT id FROM task_assignments WHERE task_id = $1`, [id]);
        const allIds = allAssigns.rows.map(r => r.id);
        if (allIds.length > 0) {
          await client.query(`DELETE FROM task_assignments WHERE task_id = $1`, [id]);
        }
      }

      for (const assign of assignments) {
        let currentAssignmentId = isValidUUID(assign.assignment_id) ? assign.assignment_id : null;
        const userId = isValidUUID(assign.user_id) ? assign.user_id : null;
        
        if (!currentAssignmentId) {
          const newAssignRes = await client.query(
            `INSERT INTO task_assignments (task_id, user_id, role_or_name) VALUES ($1, $2, $3) RETURNING id`,
            [id, userId, assign.role_or_name || 'เพิ่มด้วยตนเอง']
          );
          currentAssignmentId = newAssignRes.rows[0].id;
        } else {
          await client.query(
            `UPDATE task_assignments SET user_id = $1 WHERE id = $2 AND task_id = $3`,
            [userId, currentAssignmentId, id]
          );
        }
      }
    } else {
        const allAssigns = await client.query(`SELECT id FROM task_assignments WHERE task_id = $1`, [id]);
        const allIds = allAssigns.rows.map(r => r.id);
        if (allIds.length > 0) {
          await client.query(`DELETE FROM task_assignments WHERE task_id = $1`, [id]);
        }
    }

    await logTaskAction(client, id, req.user?.id, 'updated_details', { name, date, main_text, urgency_level, secret_level });

    await client.query('COMMIT');
    res.status(200).json({ success: true, message: 'บันทึกความเปลี่ยนแปลงเรียบร้อย' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Update task detail error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  } finally {
    client.release();
  }
};

exports.getTaskById = async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT 
        t.id, 
        t.title AS name, 
        t.status, 
        t.is_urgent AS "isUrgent", 
        TO_CHAR(t.due_date, 'YYYY-MM-DD"T"HH24:MI') AS date, 
        t.main_text,
        t.task_detail,
        t.notes,      
        t.memo_no, 
        t.memo_date,
        t.urgency_level,
        t.secret_level,
        t.receive_no,
        t.created_at AS "createdAt",
        t.sign_date,
        t.meeting_date,
        t.reply_due_date,
        t.created_by,
        c.name AS "creatorName",
        d.drive_web_view_link AS document_link,
        COALESCE(
          json_agg(
            json_build_object(
              'assignment_id', ta.id,
              'user_id', ta.user_id,             
              'role_or_name', ta.role_or_name,   
              'personInCharge', COALESCE(u.name, ta.role_or_name)
            )
          ) FILTER (WHERE ta.id IS NOT NULL), '[]'
        ) AS assignments
      FROM tasks t
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      LEFT JOIN users u ON ta.user_id = u.id
      LEFT JOIN documents d ON t.document_id = d.id
      LEFT JOIN users c ON t.created_by = c.id
      WHERE t.id = $1
      GROUP BY t.id, d.drive_web_view_link, c.name, t.created_by
    `;
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const task = rows[0];
    task.personInCharge = task.assignments.map(a => a.personInCharge).join(', ') || 'ไม่ระบุ';

    res.status(200).json({ success: true, data: task });
  } catch (err) {
    console.error("Get task by id error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.deleteTask = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const assignmentsRes = await client.query('SELECT id FROM task_assignments WHERE task_id = $1', [id]);
    const assignmentIds = assignmentsRes.rows.map(row => row.id);

    await client.query('DELETE FROM task_assignments WHERE task_id = $1', [id]);
    const result = await client.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Delete task error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  } finally {
    client.release();
  }
};

exports.createTask = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { title, memo_no, memo_date, due_date, main_text, is_urgent, assignments, createdBy, created_by, urgency_level, secret_level, receive_date, sign_date, meeting_date, reply_due_date } = req.body;
    let validCreatorId = createdBy || created_by || null;
    validCreatorId = isValidUUID(validCreatorId) ? validCreatorId : null;

    const parsedMemoDate = parseThaiDateToIso(memo_date) || null;
    const parsedSignDate = parseThaiDateToIso(sign_date) || null;
    const parsedReceiveDate = parseThaiDateToIso(receive_date) || null;

    const parsedMeetingDate = parseThaiDateToIso(meeting_date) || null;
    const parsedReplyDueDate = parseThaiDateToIso(reply_due_date) || null;

    let finalDueDate = due_date || null;
    if (parsedMeetingDate) {
        finalDueDate = parsedMeetingDate;
    }

    const { receiveNo, receiveYear } = await handleReceiveNoAndYear(client, req.body.receive_no, parsedReceiveDate);

    const existingRes = await client.query('SELECT id FROM tasks WHERE receive_no = $1 AND receive_year = $2', [receiveNo, receiveYear]);
    let taskId;

    if (existingRes.rows.length > 0) {
        taskId = existingRes.rows[0].id;
        await client.query(
          `UPDATE tasks SET title = COALESCE($1, title), memo_no = $2, memo_date = $3, main_text = $4, due_date = COALESCE($5, due_date), is_urgent = COALESCE($6, is_urgent), urgency_level = $7, secret_level = $8, sign_date = $10, meeting_date = $11, reply_due_date = $12, created_at = COALESCE(CAST($9 AS timestamp), created_at), updated_at = NOW() WHERE id = $13`,
          [title || 'ไม่ระบุชื่อเรื่อง', memo_no, parsedMemoDate, main_text, finalDueDate, is_urgent, urgency_level, secret_level, parsedReceiveDate, parsedSignDate, parsedMeetingDate, parsedReplyDueDate, taskId]
        );
        await logTaskAction(client, taskId, validCreatorId, 'updated_task', { source: 'manual_create_upsert' });
        await client.query('DELETE FROM task_assignments WHERE task_id = $1', [taskId]);
    } else {
        const taskRes = await client.query(
          `INSERT INTO tasks (title, memo_no, memo_date, main_text, due_date, is_urgent, status, created_by, urgency_level, secret_level, sign_date, meeting_date, reply_due_date, receive_no, receive_year, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $12, $13, $14, $15, $16, COALESCE(CAST($11 AS timestamp), NOW())) RETURNING id`,
          [title || 'ไม่ระบุชื่อเรื่อง', memo_no, parsedMemoDate, main_text, finalDueDate, is_urgent || false, 'following', validCreatorId, urgency_level, secret_level, parsedReceiveDate, parsedSignDate, parsedMeetingDate, parsedReplyDueDate, receiveNo, receiveYear]
        );
        taskId = taskRes.rows[0].id;
        await logTaskAction(client, taskId, validCreatorId, 'created_task', { source: 'manual_create' });
    }

    // 🔒 ตรวจสอบ Array Type ป้องกัน Crash 
    if (Array.isArray(assignments) && assignments.length > 0) {
      for (const assign of assignments) {
        const userId = isValidUUID(assign.user_id) ? assign.user_id : null;
        const roleOrName = assign.role_or_name || null;

        const assignRes = await client.query(
          `INSERT INTO task_assignments (task_id, user_id, role_or_name) VALUES ($1, $2, $3) RETURNING id`,
          [taskId, userId, roleOrName]
        );
        const assignmentId = assignRes.rows[0].id;
      }
    }


    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'สร้างงานสำเร็จ!', taskId: taskId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Create task error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  } finally {
    client.release();
  }
};

exports.getTaskLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT tl.id, tl.action, tl.details, tl.created_at, u.name as user_name, u.role as user_role, u.color as user_color 
       FROM task_logs tl
       LEFT JOIN users u ON tl.user_id = u.id
       WHERE tl.task_id = $1
       ORDER BY tl.created_at DESC`,
      [id]
    );
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error("Get task logs error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getNextReserveNo = async (req, res) => {
  const client = await pool.connect();
  try {
    const currentYear = new Date().getFullYear();
    const resCount = await client.query('SELECT MAX(receive_no) as max_no FROM tasks WHERE receive_year = $1', [currentYear]);
    const nextReceiveNo = (resCount.rows[0].max_no || 0) + 1;
    res.status(200).json({ success: true, nextReceiveNo, currentYear });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  } finally {
    client.release();
  }
};

exports.reserveTask = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    let validCreatorId = req.user?.id || null;
    const currentYear = new Date().getFullYear();
    
    let { range } = req.body; 
    
    let startNo = 0;
    let endNo = 0;
    
    if (range) {
      const rangeStr = String(range).trim();
      if (rangeStr.includes('-')) {
        const parts = rangeStr.split('-');
        startNo = parseInt(parts[0], 10);
        endNo = parseInt(parts[1], 10);
      } else {
        startNo = parseInt(rangeStr, 10);
        endNo = startNo;
      }
    } else {
      const resCount = await client.query('SELECT MAX(receive_no) as max_no FROM tasks WHERE receive_year = $1', [currentYear]);
      startNo = (resCount.rows[0].max_no || 0) + 1;
      endNo = startNo;
    }
    
    if (isNaN(startNo) || isNaN(endNo) || startNo > endNo) {
      throw new Error("รูปแบบช่วงเลขรับไม่ถูกต้อง (เช่น 100 หรือ 100-105)");
    }

    const createdIds = [];
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14); // กำหนดส่ง +14 วัน

    for (let i = startNo; i <= endNo; i++) {
      const taskRes = await client.query(
        `INSERT INTO tasks (title, status, created_by, receive_no, receive_year, due_date)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        ['กันเลขลงรับ', 'following', validCreatorId, i, currentYear, dueDate]
      );
      const taskId = taskRes.rows[0].id;
      createdIds.push(taskId);
      await logTaskAction(client, taskId, validCreatorId, 'created_task', { source: 'reserve_number', no: i });
    }
    
    await client.query('COMMIT');
    res.status(201).json({ 
      success: true, 
      message: 'จองเลขรับสำเร็จ!', 
      createdCount: createdIds.length,
      startNo, 
      endNo, 
      receive_year: currentYear 
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Reserve task error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  } finally {
    client.release();
  }
};