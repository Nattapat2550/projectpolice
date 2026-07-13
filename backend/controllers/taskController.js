const pool = require('../config/db');
const fs = require('fs').promises;
const path = require('path'); // เพิ่ม module path สำหรับป้องกัน Path Traversal
const { uploadToDrive } = require('../services/googleDriveService');
const { generateHash } = require('../utils/duplicateChecker');

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID; 
// กำหนดโฟลเดอร์สำหรับเก็บไฟล์ชั่วคราวให้ชัดเจน (แก้ไข path ให้ตรงกับที่ตั้งโฟลเดอร์ uploads ของคุณ)
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads'); 

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
        t.is_urgent AS "isUrgent"
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
        t.is_urgent AS "isUrgent"
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
    const validCreatorId = createdBy ? createdBy : null;
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
        const taskRes = await client.query(
          `INSERT INTO tasks (document_id, title, memo_no, memo_date, main_text, due_date, is_urgent, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [ 
            documentId, 
            memo.เรื่อง || 'ไม่ระบุชื่อเรื่อง', 
            memo.ที่, 
            memo.วันที่, 
            memo.main_text, 
            memo.due_date || null,
            memo.isUrgent || false,
            validCreatorId
          ]
        );
        const taskId = taskRes.rows[0].id;

        if (Array.isArray(memo.assignments) && memo.assignments.length > 0) {
          for (const assign of memo.assignments) {
            const userId = assign.user_id ? assign.user_id : null; 
            const personStr = assign.responsible_person || '';

            const assignRes = await client.query(
              `INSERT INTO task_assignments (task_id, user_id, role_or_name)
               VALUES ($1, $2, $3) RETURNING id`,
              [taskId, userId, personStr]
            );
            const assignmentId = assignRes.rows[0].id;

            if (Array.isArray(assign.topics) && assign.topics.length > 0) {
              for (const topic of assign.topics) {
                await client.query(
                  `INSERT INTO task_topics (assignment_id, detail, is_completed) VALUES ($1, $2, $3)`,
                  [assignmentId, topic, false]
                );
              }
            }
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
      const { name, date, notes, assignments, isUrgent, main_text } = req.body;
  
      const validDate = (date === "" || !date) ? null : date;
      const urgentValue = isUrgent !== undefined ? isUrgent : null; 
  
      await client.query(
        `UPDATE tasks 
         SET title = COALESCE($1, title), 
             due_date = COALESCE($2, due_date), 
             notes = COALESCE($3, notes), 
             is_urgent = COALESCE($4, is_urgent),
             main_text = COALESCE($5, main_text),
             updated_at = NOW() 
         WHERE id = $6`,
        [name, validDate, notes, urgentValue, main_text, id]
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
          await client.query(`DELETE FROM task_topics WHERE assignment_id = ANY($1::uuid[])`, [delIds]);
        }
        await client.query(`DELETE FROM task_assignments WHERE task_id = $1 AND NOT (id = ANY($2::uuid[]))`, [id, keepAssignmentIds]);
      } else {
        const allAssigns = await client.query(`SELECT id FROM task_assignments WHERE task_id = $1`, [id]);
        const allIds = allAssigns.rows.map(r => r.id);
        if (allIds.length > 0) {
          await client.query(`DELETE FROM task_topics WHERE assignment_id = ANY($1::uuid[])`, [allIds]);
          await client.query(`DELETE FROM task_assignments WHERE task_id = $1`, [id]);
        }
      }

      for (const assign of assignments) {
        let currentAssignmentId = assign.assignment_id;
        const userId = assign.user_id ? assign.user_id : null;
        
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

        if (Array.isArray(assign.topics)) {
          const keepTopicIds = assign.topics
                                .filter(t => t.topic_id)
                                .map(t => t.topic_id)
                                .filter(id => id != null && id !== ''); 
          
          if (keepTopicIds.length > 0) {
            await client.query(`DELETE FROM task_topics WHERE assignment_id = $1 AND NOT (id = ANY($2::uuid[]))`, [currentAssignmentId, keepTopicIds]);
          } else {
            await client.query(`DELETE FROM task_topics WHERE assignment_id = $1`, [currentAssignmentId]);
          }

          for (const topic of assign.topics) {
            if (topic.topic_id) {
              await client.query(
                `UPDATE task_topics SET detail = $1, is_completed = $2 WHERE id = $3`,
                [topic.detail, topic.is_completed || false, topic.topic_id]
              );
            } else {
              await client.query(
                `INSERT INTO task_topics (assignment_id, detail, is_completed) VALUES ($1, $2, $3)`,
                [currentAssignmentId, topic.detail, topic.is_completed || false]
              );
            }
          }
        } else {
           await client.query(`DELETE FROM task_topics WHERE assignment_id = $1`, [currentAssignmentId]);
        }
      }
    } else {
        const allAssigns = await client.query(`SELECT id FROM task_assignments WHERE task_id = $1`, [id]);
        const allIds = allAssigns.rows.map(r => r.id);
        if (allIds.length > 0) {
          await client.query(`DELETE FROM task_topics WHERE assignment_id = ANY($1::uuid[])`, [allIds]);
          await client.query(`DELETE FROM task_assignments WHERE task_id = $1`, [id]);
        }
    }

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
        t.notes,      
        t.memo_no, 
        t.memo_date,
        c.name AS "creatorName",
        d.drive_web_view_link AS document_link,
        COALESCE(
          json_agg(
            json_build_object(
              'assignment_id', ta.id,
              'user_id', ta.user_id,             
              'role_or_name', ta.role_or_name,   
              'personInCharge', COALESCE(u.name, ta.role_or_name),
              'topics', (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'topic_id', tt.id,          
                      'detail', tt.detail,
                      'is_completed', COALESCE(tt.is_completed, false)
                    ) ORDER BY tt.id ASC
                  ), '[]'::json)
                FROM task_topics tt 
                WHERE tt.assignment_id = ta.id
              )
            )
          ) FILTER (WHERE ta.id IS NOT NULL), '[]'
        ) AS assignments
      FROM tasks t
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      LEFT JOIN users u ON ta.user_id = u.id
      LEFT JOIN documents d ON t.document_id = d.id
      LEFT JOIN users c ON t.created_by = c.id
      WHERE t.id = $1
      GROUP BY t.id, d.drive_web_view_link, c.name
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

    if (assignmentIds.length > 0) {
      await client.query('DELETE FROM task_topics WHERE assignment_id = ANY($1::uuid[])', [assignmentIds]);
    }
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
    
    const { title, memo_no, memo_date, due_date, main_text, is_urgent, assignments, createdBy, created_by } = req.body;
    const validCreatorId = createdBy || created_by || null;

    const taskRes = await client.query(
      `INSERT INTO tasks (title, memo_no, memo_date, main_text, due_date, is_urgent, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [title || 'ไม่ระบุชื่อเรื่อง', memo_no, memo_date || null, main_text, due_date || null, is_urgent || false, 'following', validCreatorId]
    );
    const taskId = taskRes.rows[0].id;

    // 🔒 ตรวจสอบ Array Type ป้องกัน Crash 
    if (Array.isArray(assignments) && assignments.length > 0) {
      for (const assign of assignments) {
        const userId = assign.user_id ? assign.user_id : null;
        const roleOrName = assign.role_or_name || null;

        const assignRes = await client.query(
          `INSERT INTO task_assignments (task_id, user_id, role_or_name) VALUES ($1, $2, $3) RETURNING id`,
          [taskId, userId, roleOrName]
        );
        const assignmentId = assignRes.rows[0].id;

        if (Array.isArray(assign.topics) && assign.topics.length > 0) {
          for (const topicDetail of assign.topics) {
            await client.query(
              `INSERT INTO task_topics (assignment_id, detail, is_completed) VALUES ($1, $2, $3)`,
              [assignmentId, topicDetail, false]
            );
          }
        }
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