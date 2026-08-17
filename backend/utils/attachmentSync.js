/**
 * Helper to sync and parse notes & attachments in task_documents when additional_docs text is provided
 * (e.g. from Google Sheet Webhook or Excel upload or direct update)
 */

const cleanAdditionalDocs = (text) => {
  if (!text) return null;
  let str = String(text).trim();
  // Strip leading single quotes from Excel (e.g. '2, 3, 4 -> 2, 3, 4)
  str = str.replace(/^'+/, '').trim();
  if (!str || str === '-' || str === 'ไม่มี') return null;

  const parts = str.split(/(?:,\s*|\r?\n)+/).map(p => p.trim()).filter(p => {
    if (!p) return false;
    if (p === 'เอกสารต้นฉบับ' || p.includes('เอกสารต้นฉบับ')) return false;
    return true;
  });
  return parts.length > 0 ? str : null;
};

function parseAdditionalDocsText(text) {
  const cleaned = cleanAdditionalDocs(text);
  if (!cleaned) return [];
  let str = String(cleaned).trim();
  str = str.replace(/^'+/, '').trim();

  // 1. ถ้าข้อความเป็นลำดับตัวเลข/เลขหน้า/ช่วงหน้าทั้งหมด เช่น "2, 3, 4", "2-4", "1-5", "หน้า 2, 3, 4", "แผ่นที่ 1, 2"
  const isPurePageNumbers = /^(?:หน้า\s*|แผ่นที่\s*|แผ่น\s*)?[\d๐-๙]+(?:\s*[\,\-\–\/]\s*[\d๐-๙]+)*(?:\s*(?:แผ่น|หน้า|ฉบับ|ชุด))?$/i.test(str);
  if (isPurePageNumbers) {
    const pageNote = str.replace(/^(?:หน้า|แผ่นที่|แผ่น)\s*/i, '').trim();
    return [{
      filename: "เอกสารแนบ",
      link: null,
      notes: pageNote,
      raw: str
    }];
  }

  const items = [];

  // 2. ถ้าในข้อความมี URL http/https ให้แบ่งตาม URL แต่ละรายการ
  const urlRegex = /(?:^|\s*,\s*|\r?\n|;\s*)(.*?)(https?:\/\/[^\s,]+)/gi;
  let match;
  let hasUrls = false;

  while ((match = urlRegex.exec(str)) !== null) {
    hasUrls = true;
    let prefix = match[1] ? match[1].trim() : '';
    let link = match[2] ? match[2].trim().replace(/[:,\s\)]+$/, '') : null;

    prefix = prefix.replace(/^[:\s\-]+|[:\s\-]+$/g, '').trim();
    prefix = prefix.replace(/^\d+\.\s*/, '').trim();

    let filename = null;
    let notes = null;

    if (prefix) {
      const noteMatch = prefix.match(/^(.*?)\s*[\(\[（【]([^)\]）】]+)[\)\]）】]$/);
      if (noteMatch && noteMatch[1].trim()) {
        filename = noteMatch[1].trim();
        notes = noteMatch[2].trim();
      } else {
        filename = prefix;
      }
    }

    if (filename === 'เอกสารต้นฉบับ' || (filename && filename.includes('เอกสารต้นฉบับ'))) {
      continue;
    }

    items.push({
      filename: filename || "เอกสารแนบ",
      link: link,
      notes: notes,
      raw: match[0].trim()
    });
  }

  // 3. ถ้าไม่มี URL ในข้อความเลย ให้แยกตาม semicolon, newline หรือหมายเลขลำดับ
  if (!hasUrls) {
    const rawParts = str.split(/(?:;\s*|\r?\n|(?<=\s|^)\d+\.\s+)+/);

    for (const part of rawParts) {
      const trimmed = part.trim().replace(/^\d+\.\s*/, '');
      if (!trimmed || trimmed === 'เอกสารต้นฉบับ' || trimmed.includes('เอกสารต้นฉบับ')) continue;

      let filename = null;
      let notes = null;

      const noteMatch = trimmed.match(/^(.*?)\s*[\(\[（【]([^)\]）】]+)[\)\]）】]$/);
      if (noteMatch && noteMatch[1].trim()) {
        filename = noteMatch[1].trim();
        notes = noteMatch[2].trim();
      } else {
        if (/^(?:หน้า\s*|แผ่นที่\s*|แผ่น\s*)?[\d๐-๙]+(?:\s*[\,\-\–\/]\s*[\d๐-๙]+)*(?:\s*(?:แผ่น|หน้า|ฉบับ|ชุด))?$/i.test(trimmed)) {
          filename = "เอกสารแนบ";
          notes = trimmed.replace(/^(?:หน้า|แผ่นที่|แผ่น)\s*/i, '').trim();
        } else {
          filename = trimmed;
        }
      }

      items.push({
        filename: filename || "เอกสารแนบ",
        link: null,
        notes: notes,
        raw: trimmed
      });
    }
  }

  return items;
}

exports.cleanAdditionalDocs = cleanAdditionalDocs;
exports.parseAdditionalDocsText = parseAdditionalDocsText;

exports.syncTaskDocumentNotesFromText = async (dbQueryable, taskId, additionalDocsText, userId = null) => {
  if (additionalDocsText === undefined || taskId == null) return;

  try {
    const rawText = cleanAdditionalDocs(additionalDocsText) || '';

    // ลบแถวเอกสารต้นฉบับออกจาก task_documents
    await dbQueryable.query(`DELETE FROM task_documents WHERE task_id = $1 AND (filename = 'เอกสารต้นฉบับ' OR LOWER(filename) LIKE '%เอกสารต้นฉบับ%')`, [taskId]);

    if (!rawText) {
      await dbQueryable.query(`UPDATE task_documents SET notes = NULL WHERE task_id = $1`, [taskId]);
      return;
    }

    const parsedItems = parseAdditionalDocsText(rawText);
    if (parsedItems.length === 0) return;

    // ดึงรายการเอกสารแนบที่มีอยู่เดิมใน task_documents
    const { rows: existingDocs } = await dbQueryable.query(
      `SELECT id, filename, notes, drive_web_view_link FROM task_documents WHERE task_id = $1 ORDER BY id ASC`,
      [taskId]
    );

    if (existingDocs && existingDocs.length > 0) {
      // ตรวจสอบกรณีที่มีเอกสารแนบเดิมหลายรายการ และข้อความใหม่เป็นชุดตัวเลขคั่นด้วย comma เช่น "123, 456, 76" หรือ "2, 3, 4"
      const isPureNumberList = /^[\d๐-๙\s,;\-]+$/.test(rawText);
      const subNotes = rawText.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);

      if (isPureNumberList && subNotes.length === existingDocs.length && parsedItems.length === 1 && !parsedItems[0].link) {
        for (let i = 0; i < existingDocs.length; i++) {
          await dbQueryable.query(
            `UPDATE task_documents SET notes = $1 WHERE id = $2`,
            [subNotes[i], existingDocs[i].id]
          );
        }
      } else {
        for (let i = 0; i < parsedItems.length; i++) {
          const item = parsedItems[i];
          let doc = existingDocs.find(d => 
            (item.link && d.drive_web_view_link === item.link) || 
            (item.filename && d.filename === item.filename)
          ) || existingDocs[i];

          if (doc) {
            // ป้องกันไม่ให้ชื่อไฟล์จริงถูกเขียนทับด้วย "เอกสารแนบ" หรือตัวเลขลอยๆ
            const isRealCustomName = item.filename && item.filename !== 'เอกสารแนบ' && !/^\d+$/.test(item.filename);
            const finalFilename = isRealCustomName ? item.filename : doc.filename;

            await dbQueryable.query(
              `UPDATE task_documents SET notes = COALESCE($1, notes), drive_web_view_link = COALESCE($2, drive_web_view_link), filename = $3 WHERE id = $4`,
              [item.notes, item.link, finalFilename, doc.id]
            );
          } else {
            await dbQueryable.query(
              `INSERT INTO task_documents (task_id, filename, drive_web_view_link, doc_type, notes, created_by) VALUES ($1, $2, $3, 'attachment', $4, $5)`,
              [taskId, item.filename, item.link, item.notes, userId]
            );
          }
        }
      }
    } else {
      // หากยังไม่มีเอกสารแนบ ให้บันทึกรายการทั้งหมดที่แกะได้ลงใน task_documents
      for (const item of parsedItems) {
        await dbQueryable.query(
          `INSERT INTO task_documents (task_id, filename, drive_web_view_link, doc_type, notes, created_by) VALUES ($1, $2, $3, 'attachment', $4, $5)`,
          [taskId, item.filename, item.link, item.notes, userId]
        );
      }
    }

  } catch (err) {
    console.error("[syncTaskDocumentNotesFromText Error]:", err.message);
  }
};
