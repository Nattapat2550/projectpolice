/**
 * Helper to sync and parse notes & attachments in task_documents when additional_docs text is provided
 * (e.g. from Google Sheet Webhook or Excel upload or direct update)
 */

const cleanAdditionalDocs = (text) => {
  if (!text) return null;
  let str = String(text).trim();
  if (!str) return null;
  if (/^(?:เอกสาร\s*[๐-๙0-9]+(?:\s*[,;\n\s]*|\s*$))+$/i.test(str)) {
    return null;
  }
  const parts = str.split(/(?:,\s*|\r?\n)+/).map(p => p.trim()).filter(p => {
    if (!p) return false;
    if (p.includes('เอกสารต้นฉบับ')) return false;
    if (/^เอกสาร\s*[๐-๙0-9]+$/i.test(p)) return false;
    return true;
  });
  return parts.length > 0 ? parts.join(', ') : null;
};

function parseAdditionalDocsText(text) {
  const cleaned = cleanAdditionalDocs(text);
  if (!cleaned) return [];
  const str = String(cleaned).trim();

  const items = [];
  // Split by comma or newline
  const rawParts = str.split(/(?:,\s*|\r?\n)+/);

  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed.includes('เอกสารต้นฉบับ') || /^เอกสาร\s*[๐-๙0-9]+$/i.test(trimmed)) continue;

    let link = null;
    let filename = null;
    let notes = null;

    // ดึง URL ลิงก์ Drive หรือ HTTP
    const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/i);
    if (urlMatch) {
      link = urlMatch[1].replace(/[:,\s]+$/, '');
    }

    // ข้อความที่ตัด URL ออกแล้ว
    let textWithoutUrl = trimmed.replace(/https?:\/\/[^\s]+/gi, '').trim();
    textWithoutUrl = textWithoutUrl.replace(/^[:\s\-]+|[:\s\-]+$/g, '').trim();

    if (textWithoutUrl) {
      // ตรวจหาหมายเหตุ/เลขหน้า ในวงเล็บท้ายชื่อไฟล์ เช่น "filename.pdf (555)"
      const noteMatch = textWithoutUrl.match(/^(.*?)\s*\(([^)]+)\)$/);
      if (noteMatch && noteMatch[1].trim()) {
        filename = noteMatch[1].trim();
        notes = noteMatch[2].trim();
      } else {
        filename = textWithoutUrl;
      }
    }

    if (!filename && link) {
      filename = "เอกสารแนบ";
    }

    if (filename || link) {
      items.push({
        filename: filename || "เอกสารแนบ",
        link: link || null,
        notes: notes || null,
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

    // ลบแถวเอกสารต้นฉบับและเอกสารตัวเลขอันลอยๆ ออกจาก task_documents
    await dbQueryable.query(`DELETE FROM task_documents WHERE task_id = $1 AND (filename = 'เอกสารต้นฉบับ' OR LOWER(filename) LIKE '%เอกสารต้นฉบับ%' OR filename ~ '^เอกสาร\\s*[๐-๙0-9]+$')`, [taskId]);

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
      for (let i = 0; i < parsedItems.length; i++) {
        const item = parsedItems[i];
        let doc = existingDocs.find(d => 
          (item.link && d.drive_web_view_link === item.link) || 
          (item.filename && d.filename === item.filename)
        ) || existingDocs[i];

        if (doc) {
          await dbQueryable.query(
            `UPDATE task_documents SET notes = COALESCE($1, notes), drive_web_view_link = COALESCE($2, drive_web_view_link), filename = COALESCE($3, filename) WHERE id = $4`,
            [item.notes, item.link, item.filename, doc.id]
          );
        } else {
          await dbQueryable.query(
            `INSERT INTO task_documents (task_id, filename, drive_web_view_link, doc_type, notes, created_by) VALUES ($1, $2, $3, 'attachment', $4, $5)`,
            [taskId, item.filename, item.link, item.notes, userId]
          );
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
