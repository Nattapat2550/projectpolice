/**
 * Utility to parse registration number (receive_no), sender (จาก), and assignee (ผู้รับผิดชอบ)
 * from filenames like "556-ศตคม.(ตู่).pdf", "556-ศตคม.-ตู่.pdf", "556-ศตคม.pdf", etc.
 * Also provides formatStandardFilename to format filenames when saving/uploading to Drive.
 */

function convertThaiDigits(str) {
  if (!str) return "";
  const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
  return str.replace(/[๐-๙]/g, (m) => thaiDigits.indexOf(m).toString());
}

/**
 * Cleans titles, ranks, and roles in parentheses from names to keep only the plain name.
 * e.g. "ด.ต. สมชาย (ฝอ.1)" => "สมชาย"
 * e.g. "ตู่ (สว.ฝอ.4)" => "ตู่"
 */
function cleanToOnlyName(str) {
  if (!str || typeof str !== 'string') return '';
  let s = str.trim();
  s = s.replace(/[\(\[\（].*?[\)\]\）]/g, '').trim();
  s = s.replace(/^(?:พล\.ต\.อ\.|พล\.ต\.ท\.|พล\.ต\.ต\.|พ\.ต\.อ\.|พ\.ต\.ท\.|พ\.ต\.ต\.|ร\.ต\.อ\.|ร\.ต\.ท\.|ร\.ต\.ต\.|ด\.ต\.|จ\.ส\.ต\.|ส\.ต\.อ\.|ส\.ต\.ท\.|ส\.ต\.ต\.|นาย|นางสาว|นาง|น\.ส\.)\s*/gi, '').trim();
  return s || str.trim();
}

function parseFilenameInfo(filename) {
  if (!filename || typeof filename !== 'string') {
    return { receive_no: null, sender: null, assignee: null };
  }

  // Remove extension (e.g. .pdf, .jpg, .png, .docx)
  let nameWithoutExt = filename.replace(/\.[^/.]+$/, '').trim();

  let receive_no = null;
  let sender = null;
  let assignee = null;

  const hasStructure = /[0-9๐-๙\(\[\（\)\\]\）\-_]/.test(nameWithoutExt);

  // 1. Extract assignee from parentheses e.g. (ตู่), [ตู่], （ตู่）
  const parenMatch = nameWithoutExt.match(/[\(\[\（]([^\)\]\）]+)[\)\]\）]/);
  if (parenMatch) {
    assignee = cleanToOnlyName(parenMatch[1]);
    nameWithoutExt = nameWithoutExt.replace(/[\(\[\（][^\)\]\）]+[\)\]\）]/, '').trim();
  }

  // Clean trailing/leading hyphens, underscores, spaces (preserve dots!)
  nameWithoutExt = nameWithoutExt.replace(/^[-_\s]+|[-_\s]+$/g, '');

  // 2. Split by hyphen or underscore
  let parts = nameWithoutExt.split(/[-_]/).map(p => p.trim()).filter(Boolean);

  if (parts.length === 1 && !parenMatch) {
    const spaceParts = nameWithoutExt.split(/\s+/).map(p => p.trim()).filter(Boolean);
    if (spaceParts.length > 1) {
      parts = spaceParts;
    }
  }

  // 3. If assignee wasn't in parentheses, check if we have 3+ parts e.g. "556-ศตคม-ตู่"
  if (!assignee && parts.length >= 3) {
    const firstNum = convertThaiDigits(parts[0]);
    if (/^\d+$/.test(firstNum)) {
      assignee = cleanToOnlyName(parts[parts.length - 1]);
      parts = parts.slice(0, parts.length - 1);
    }
  }

  // 4. Iterate parts for receive_no and sender
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const convertedDigits = convertThaiDigits(part);

    if (/^\d+$/.test(convertedDigits) && !receive_no) {
      receive_no = convertedDigits;
    } else if (!sender) {
      let cleanSender = part.replace(/^[-_\s]+|[-_\s]+$/g, '');
      
      // If assignee is not found yet, and cleanSender looks like "ศตคม.ตู่" (dot before non-dot word at end)
      if (!assignee && cleanSender.includes('.')) {
        const dotMatch = cleanSender.match(/^(.+\.)([^.]+?)$/);
        if (dotMatch && dotMatch[2] && dotMatch[2].length <= 15) {
          cleanSender = dotMatch[1];
          assignee = cleanToOnlyName(dotMatch[2]);
        }
      }
      
      cleanSender = cleanSender.replace(/(\.\d+)\.$/, '$1');
      if (cleanSender) {
        sender = cleanSender;
      }
    }
  }

  if (!hasStructure && !receive_no && !assignee) {
    sender = null;
  }

  return { receive_no, sender, assignee };
}

/**
 * Constructs a standardized filename like "556-ศตคม.(ตู่).pdf" from parameters.
 * Only uses plain name for assignee (no ranks/roles).
 */
function formatStandardFilename(receive_no, sender, assignee, originalname) {
  const extMatch = (originalname || '').match(/(\.[^/.]+)$/);
  const ext = extMatch ? extMatch[1] : '.pdf';

  const cleanNo = receive_no ? String(receive_no).trim() : '';
  
  let cleanSender = sender ? String(sender).trim() : '';
  cleanSender = cleanSender.replace(/\.$/, ''); // Clean trailing dot to avoid double dots

  let cleanAssignee = '';
  if (Array.isArray(assignee)) {
    cleanAssignee = assignee
      .map(a => (typeof a === 'object' && a !== null ? (a.responsible_person || a.role_or_name || a.name || '') : String(a)))
      .map(cleanToOnlyName)
      .filter(Boolean)
      .join(',');
  } else if (assignee) {
    cleanAssignee = cleanToOnlyName(String(assignee));
  }

  let parts = [];
  if (cleanNo && cleanSender) {
    parts.push(`${cleanNo}-${cleanSender}`);
  } else if (cleanNo) {
    parts.push(cleanNo);
  } else if (cleanSender) {
    parts.push(cleanSender);
  }

  let baseName = parts.join('');

  if (cleanAssignee) {
    if (baseName) {
      baseName += `.(${cleanAssignee})`;
    } else {
      baseName = `(${cleanAssignee})`;
    }
  }

  if (!baseName) {
    return originalname || `document${ext}`;
  }

  return `${baseName}${ext}`;
}

module.exports = { parseFilenameInfo, formatStandardFilename, cleanToOnlyName };
