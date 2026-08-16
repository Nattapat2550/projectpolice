const pool = require('../config/db');
const { cleanToOnlyName, formatStandardFilename } = require('../utils/filenameParser');
const { renameFileOnDrive } = require('../services/googleDriveService');
const { syncTaskDocumentNotesFromText } = require('../utils/attachmentSync');

exports.handleSheetUpdate = async (req, res) => {
  console.log("\n================ WEBHOOK RECEIVED ================");
  console.log("Webhook Payload:", req.body);
  const data = req.body || {};
  const taskId = data.id || data.ID || data['ID'] || data['id'];

  if (!taskId) {
    return res.status(400).json({ success: false, message: 'Missing Task ID' });
  }

  const receive_no = data.receive_no !== undefined ? data.receive_no : (data['เลขทะเบียน'] !== undefined ? data['เลขทะเบียน'] : null);
  const receive_year = data.receive_year !== undefined ? data.receive_year : (data['ปีทะเบียน'] !== undefined ? data['ปีทะเบียน'] : null);
  const created_at = data.created_at || data.receive_date || data['วันที่รับ'] || null;
  const memo_no = data.memo_no !== undefined ? data.memo_no : (data['ที่หนังสือ'] || data['ที่'] || null);
  const memo_date = data.memo_date !== undefined ? data.memo_date : (data['ลงวันที่'] || null);
  const sender = data.sender !== undefined ? data.sender : (data['จาก'] || null);
  const recipient_to = data.recipient_to !== undefined ? data.recipient_to : (data['ถึง'] || null);
  const title = data.title !== undefined ? data.title : (data['เรื่อง'] || null);
  const due_date = data.due_date !== undefined ? data.due_date : (data['วันที่'] || null);
  const task_detail = data.task_detail !== undefined ? data.task_detail : (data['ข้อสั่งการ'] || null);
  const sign_date = data.sign_date !== undefined ? data.sign_date : (data['วันที่ลงนาม'] || null);
  const meeting_date = data.meeting_date !== undefined ? data.meeting_date : (data['วันประชุม'] || data['วันที่ประชุม'] || null);
  const reply_due_date = data.reply_due_date !== undefined ? data.reply_due_date : (data['กำหนดส่งตอบรับ'] || data['กำหนดตอบกลับ'] || null);
  const notes = data.notes !== undefined ? data.notes : (data['หมายเหตุ'] || null);
  const urgency_level = data.urgency_level || data.urgencyLevel || data['ชั้นความเร็ว'] || data['ความเร่งด่วน'] || null;
  const secret_level = data.secret_level || data.secretLevel || data['ชั้นความลับ'] || data['ความลับ'] || null;
  const additional_docs = data.additional_docs !== undefined ? data.additional_docs : (data['เอกสารข้อมูลเพิ่มเติม'] || null);
  const document_link = data.document_link || data.drive_web_view_link || data['ลิงก์ไฟล์ต้นฉบับ'] || null;

  const parseDate = (d) => {
    if (!d) return null;
    const str = String(d).trim();
    if (!str) return null;

    // Case 1: DD/MM/YYYY or D/M/YYYY (e.g. 22/7/2569, 05/08/2569, 22/07/2026)
    const dmYMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmYMatch) {
      let day = parseInt(dmYMatch[1], 10);
      let month = parseInt(dmYMatch[2], 10);
      let year = parseInt(dmYMatch[3], 10);
      if (year >= 2500 && year <= 2650) year -= 543;
      if (year >= 1900 && year <= 2150 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    // Case 2: YYYY-MM-DD (e.g. 2569-07-22 or 2026-07-22)
    const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
      let year = parseInt(ymdMatch[1], 10);
      let month = parseInt(ymdMatch[2], 10);
      let day = parseInt(ymdMatch[3], 10);
      if (year >= 2500 && year <= 2650) year -= 543;
      if (year >= 1900 && year <= 2150 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    // Case 3: Fallback standard JS Date
    const dt = new Date(str);
    if (isNaN(dt.getTime())) return null;
    let year = dt.getFullYear();
    if (year >= 2500 && year <= 2650) year -= 543;
    if (year < 1900 || year > 2150) return null;
    return `${year}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

  const parseNum = (val) => {
    if (val === null || val === undefined || String(val).trim() === '') return null;
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  };

  const parseStr = (val) => {
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    return s === '' ? null : s;
  };

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateQuery = `
        UPDATE tasks 
        SET 
          receive_no = COALESCE($1, receive_no),
          receive_year = COALESCE($2, receive_year),
          memo_no = COALESCE($3, memo_no),
          memo_date = COALESCE($4, memo_date),
          sender = COALESCE($5, sender),
          recipient_to = COALESCE($6, recipient_to),
          title = COALESCE($7, title),
          due_date = COALESCE($8, due_date),
          task_detail = COALESCE($9, task_detail),
          sign_date = COALESCE($10, sign_date),
          meeting_date = COALESCE($11, meeting_date),
          reply_due_date = COALESCE($12, reply_due_date),
          notes = COALESCE($13, notes),
          additional_docs = COALESCE($14, additional_docs),
          urgency_level = COALESCE($15, urgency_level),
          secret_level = COALESCE($16, secret_level),
          created_at = COALESCE(CAST($17 AS timestamp), created_at),
          updated_at = NOW()
        WHERE id = $18
      `;

      await client.query(updateQuery, [
        parseNum(receive_no),
        parseNum(receive_year),
        parseStr(memo_no),
        parseDate(memo_date),
        parseStr(sender),
        parseStr(recipient_to),
        parseStr(title),
        parseDate(due_date),
        parseStr(task_detail),
        parseDate(sign_date),
        parseDate(meeting_date),
        parseDate(reply_due_date),
        parseStr(notes),
        parseStr(additional_docs),
        parseStr(urgency_level),
        parseStr(secret_level),
        parseDate(created_at),
        taskId
      ]);

      if (additional_docs !== undefined && additional_docs !== null) {
        await syncTaskDocumentNotesFromText(client, taskId, additional_docs);
      }

      // 📄 หากมีการส่ง document_link (ลิงก์ไฟล์ต้นฉบับ) มาจาก Google Sheets
      if (document_link) {
        const taskRes = await client.query('SELECT document_id FROM tasks WHERE id = $1', [taskId]);
        if (taskRes.rows.length > 0) {
          const docId = taskRes.rows[0].document_id;
          if (docId) {
            await client.query('UPDATE documents SET drive_web_view_link = $1 WHERE id = $2', [document_link, docId]);
          } else {
            const newDocRes = await client.query(
              `INSERT INTO documents (drive_web_view_link, filename) VALUES ($1, $2) RETURNING id`,
              [document_link, 'ไฟล์ต้นฉบับ (จาก Sheet)']
            );
            await client.query('UPDATE tasks SET document_id = $1 WHERE id = $2', [newDocRes.rows[0].id, taskId]);
          }
        }
      }

      // 👥 หากมีการส่งข้อมูลผู้รับผิดชอบ (personInCharge) มาจาก Google Sheets
      const personInCharge = data.personInCharge !== undefined ? data.personInCharge 
        : (data.person_in_charge !== undefined ? data.person_in_charge 
        : (data.responsible_person !== undefined ? data.responsible_person 
        : (data.assignee !== undefined ? data.assignee 
        : (data['ผู้ปฏิบัติ'] !== undefined ? data['ผู้ปฏิบัติ'] : undefined))));

      if (personInCharge !== undefined && personInCharge !== null && String(personInCharge).trim() !== '') {
        const rawAssignees = String(personInCharge)
          .split(/[,;\n]/)
          .map(s => s.trim())
          .filter(Boolean);
        for (const rawAssignee of rawAssignees) {
          const cleanName = cleanToOnlyName(rawAssignee);
          if (!cleanName) continue;
          // ค้นหา user_id ในระบบที่มีชื่อหรือตำแหน่งตรงกัน
          const userRes = await client.query(
            `SELECT id FROM users 
             WHERE LOWER(TRIM(name)) = LOWER($1) 
                OR LOWER(TRIM(role)) = LOWER($1)
                OR LOWER(TRIM(name)) LIKE LOWER($2)
             LIMIT 1`,
            [cleanName, `%${cleanName}%`]
          );
          const matchedUserId = userRes.rows.length > 0 ? userRes.rows[0].id : null;
          const checkAss = await client.query(
            `SELECT id FROM task_assignments WHERE task_id = $1 AND (role_or_name = $2 OR (user_id IS NOT NULL AND user_id = $3))`,
            [taskId, cleanName, matchedUserId]
          );
          if (checkAss.rows.length === 0) {
            await client.query(
              `INSERT INTO task_assignments (task_id, user_id, role_or_name) VALUES ($1, $2, $3)`,
              [taskId, matchedUserId, cleanName]
            );
          }
        }
      }

      // 🏷️ อัปเดตเปลี่ยนชื่อไฟล์บน Google Drive หากแก้ไขข้อมูลที่ส่งผลต่อชื่อไฟล์
      const docRes = await client.query(
        `SELECT t.receive_no, t.sender, d.id as doc_id, d.filename, d.drive_file_id,
         (SELECT string_agg(role_or_name, ', ') FROM task_assignments ta WHERE ta.task_id = t.id) as "personInCharge"
         FROM tasks t
         LEFT JOIN documents d ON t.document_id = d.id
         WHERE t.id = $1`,
        [taskId]
      );
      if (docRes.rows.length > 0 && docRes.rows[0].doc_id && docRes.rows[0].filename) {
        const row = docRes.rows[0];
        const newFilename = formatStandardFilename(row.receive_no, row.sender, row.personInCharge, row.filename);
        if (newFilename && newFilename !== row.filename) {
          if (row.drive_file_id) {
            renameFileOnDrive(row.drive_file_id, newFilename).catch(err => console.error("[Webhook Drive Rename Error]", err.message));
          }
          await client.query('UPDATE documents SET filename = $1 WHERE id = $2', [newFilename, row.doc_id]);
        }
      }

      const editorEmail = data.editorEmail || null;
      const logDetails = { source: 'google_sheets' };
      if (editorEmail) logDetails.editor = editorEmail;

      await client.query(
        `INSERT INTO task_logs (task_id, user_id, action, details) VALUES ($1, null, 'updated_from_sheet', $2)`,
        [taskId, JSON.stringify(logDetails)]
      );

      await client.query('COMMIT');
      console.log(`[Webhook] Successfully updated task ID ${taskId} and assignees from Google Sheets`);
      res.status(200).json({ success: true, message: 'Updated from Sheet' });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Webhook] Update Error:', error);
    res.status(500).json({ success: false, message: 'Server error processing webhook', error: error.message });
  }
};
