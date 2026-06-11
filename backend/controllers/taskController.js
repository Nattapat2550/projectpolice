const pool = require('../config/db');
const fs = require('fs').promises;
const { uploadToSupabase } = require('../services/supabaseStorageService');
const { generateHash } = require('../utils/duplicateChecker');

// 💡ดึงสิทธิ์ Supabase Client เข้ามาใช้งานเพื่อรองรับการทำ Signed URL (ตั๋วเข้าชมไฟล์ชั่วคราว)
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://thlwwzvjjszjdykayufg.supabase.co', 
  process.env.SUPABASE_ANON_KEY || ''
);

// 1. ดึงงานติดตามทั้งหมด
exports.getAllTasks = async (req, res) => {
  try {
    const query = `
      SELECT 
        t.id AS id, 
        t.title AS name, 
        COALESCE(STRING_AGG(DISTINCT COALESCE(u.name, ta.role_or_name), ', '), 'ไม่ระบุ') AS "personInCharge", 
        COALESCE(
          (
            SELECT json_agg(json_build_object('name', sub.name, 'color', sub.color))
            FROM (
              SELECT DISTINCT 
                COALESCE(u2.name, ta2.role_or_name) AS name, 
                COALESCE(u2.color, '#e5e7eb') AS color
              FROM task_assignments ta2
              LEFT JOIN users u2 ON ta2.user_id = u2.id
              WHERE ta2.task_id = t.id AND (u2.name IS NOT NULL OR ta2.role_or_name IS NOT NULL)
            ) sub
          ), '[]'::json
        ) AS "assigneesData",
        TO_CHAR(t.due_date, 'YYYY-MM-DD') AS date, 
        t.created_at AS "createdAt",
        t.status,
        t.is_urgent AS "isUrgent"
      FROM tasks t
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      LEFT JOIN users u ON ta.user_id = u.id
      GROUP BY t.id
      ORDER BY t.due_date ASC NULLS LAST
    `;
    const { rows } = await pool.query(query);
    res.status(200).json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 2. ดึงงานด่วนพิเศษ
exports.getUrgentTasks = async (req, res) => {
  try {
    const query = `
      SELECT 
        t.id AS id, 
        t.title AS name, 
        COALESCE(STRING_AGG(DISTINCT COALESCE(u.name, ta.role_or_name), ', '), 'ไม่ระบุ') AS "personInCharge", 
        COALESCE(
          (
            SELECT json_agg(json_build_object('name', sub.name, 'color', sub.color))
            FROM (
              SELECT DISTINCT 
                COALESCE(u2.name, ta2.role_or_name) AS name, 
                COALESCE(u2.color, '#e5e7eb') AS color
              FROM task_assignments ta2
              LEFT JOIN users u2 ON ta2.user_id = u2.id
              WHERE ta2.task_id = t.id AND (u2.name IS NOT NULL OR ta2.role_or_name IS NOT NULL)
            ) sub
          ), '[]'::json
        ) AS "assigneesData",
        TO_CHAR(t.due_date, 'YYYY-MM-DD') AS date, 
        t.created_at AS "createdAt",
        t.status,
        t.is_urgent AS "isUrgent"
      FROM tasks t
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      LEFT JOIN users u ON ta.user_id = u.id
      WHERE t.is_urgent = true
      GROUP BY t.id
      ORDER BY t.due_date ASC NULLS LAST
    `;
    const { rows } = await pool.query(query);
    res.status(200).json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 3. อัปเดตสถานะงาน (เช่น กำลังดำเนินงาน / สำเร็จแล้ว)
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

// 4. ยืนยันการบันทึกเอกสารและกระจายงานติดตาม (ย้ายจาก Drive มา Supabase Storage สำเร็จ)
exports.confirmTasks = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { fileInfo, memos, createdBy } = req.body;
    const validCreatorId = createdBy ? createdBy : null;
    let documentId = null;

    if (fileInfo && fileInfo.path) {
      // อัปเดตทราฟฟิกอัปโหลดไฟล์ขึ้น Supabase Storage Bucket
      const supabaseFileData = await uploadToSupabase({
        path: fileInfo.path,
        originalname: fileInfo.originalname,
        mimetype: fileInfo.mimetype
      });

      // เจนรหัสแฮชเพื่อเช็คและป้องกันไฟล์เอกสารซ้ำในตาราง
      const hash = generateHash(fileInfo.text + Date.now().toString());

      // แมปเข้าคอลัมน์ใหม่ตาราง documents (storage_path และ public_url)
      const docRes = await client.query(
        `INSERT INTO documents (filename, content, content_hash, keywords_found, storage_path, public_url, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          fileInfo.originalname,
          fileInfo.text,
          hash,
          JSON.stringify({ memos }), 
          supabaseFileData.id,             // เก็บ path ของไฟล์บนระบบ storage
          supabaseFileData.publicUrl,       // ลิงก์ตรงสเปกดีฟอลต์ (สำหรับใช้บันทึกอ้างอิง)
          validCreatorId
        ]
      );
      documentId = docRes.rows[0].id;
    }

    if (memos && memos.length > 0) {
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

        if (memo.assignments && memo.assignments.length > 0) {
          for (const assign of memo.assignments) {
            const userId = assign.user_id ? assign.user_id : null; 
            const personStr = assign.responsible_person || '';

            const assignRes = await client.query(
              `INSERT INTO task_assignments (task_id, user_id, role_or_name)
               VALUES ($1, $2, $3) RETURNING id`,
              [taskId, userId, personStr]
            );
            const assignmentId = assignRes.rows[0].id;

            if (assign.topics && assign.topics.length > 0) {
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

    // ลบไฟล์ Temp ขยะในโฟลเดอร์ฝั่ง Backend คืนหน่วยความจำระบบ
    if (fileInfo && fileInfo.path) {
      try { await fs.unlink(fileInfo.path); } catch (e) { console.error("Warning: Cannot delete temp file", e.message); }
    }

    res.status(200).json({ success: true, message: 'บันทึกเอกสารและงานติดตามลงระบบสำเร็จเรียบร้อย!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Confirm error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  } finally {
    client.release();
  }
};

// 5. แก้ไขรายละเอียดงานติดตามชุดโครงสร้างย่อย
exports.updateTaskDetail = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { name, date, notes, assignments, isUrgent } = req.body;

    const validDate = (date === "" || !date) ? null : date;
    const urgentValue = isUrgent !== undefined ? isUrgent : null; 

    await client.query(
      `UPDATE tasks 
       SET title = COALESCE($1, title), 
           due_date = COALESCE($2, due_date), 
           notes = COALESCE($3, notes), 
           is_urgent = COALESCE($4, is_urgent),
           updated_at = NOW() 
       WHERE id = $5`,
      [name, validDate, notes, urgentValue, id]
    );

    if (assignments && Array.isArray(assignments)) {
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

        if (assign.topics && Array.isArray(assign.topics)) {
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

// 6. ดึงข้อมูลงานเดี่ยวผ่าน ID + 💡 มีระบบป้องกันการดึงลิงก์ไปเปิดนอกระบบ (Signed URL Hotlinking Protection)
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
        d.storage_path AS document_path, -- ดึงตำแหน่งพาร์ติชันหลักของไฟล์มาตรวจสอบสิทธิ์ Private
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
      GROUP BY t.id, d.storage_path, c.name
    `;
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const task = rows[0];
    task.personInCharge = task.assignments.map(a => a.personInCharge).join(', ') || 'ไม่ระบุ';

    // 💡 ระบบออกตั๋วเข้าถึงไฟล์ชั่วคราว (60 วินาทีเน่า) หมดสิทธิ์ก๊อปปี้ลิงก์ไปเปิดที่อื่นโดยตรง
    if (task.document_path) {
      const { data, error } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET_NAME || 'police-documents')
        .createSignedUrl(task.document_path, 60);
        
      if (!error && data) {
        task.document_link = data.signedUrl; 
      } else {
        task.document_link = null;
      }
    } else {
      task.document_link = null;
    }

    res.status(200).json({ success: true, data: task });
  } catch (err) {
    console.error("Get task by id error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 7. ลบงานติดตามระบบย่อย
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

// 8. สร้างชิ้นงานติดตามรายอันด้วยมือตนเอง (Manual Creation)
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

    if (assignments && assignments.length > 0) {
      for (const assign of assignments) {
        const userId = assign.user_id ? assign.user_id : null;
        const roleOrName = assign.role_or_name || null;

        const assignRes = await client.query(
          `INSERT INTO task_assignments (task_id, user_id, role_or_name) VALUES ($1, $2, $3) RETURNING id`,
          [taskId, userId, roleOrName]
        );
        const assignmentId = assignRes.rows[0].id;

        if (assign.topics && assign.topics.length > 0) {
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