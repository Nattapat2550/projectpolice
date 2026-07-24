import sys
import os
import json
import fitz  # PyMuPDF
import cv2
import numpy as np
import easyocr
import torch

# Enable Intel OpenCL GPU Acceleration & PyTorch 8-Core CPU Threads
cv2.ocl.setUseOpenCL(True)
cpu_cores = os.cpu_count() or 8
torch.set_num_threads(cpu_cores)

def log_progress(stage, message):
    try:
        sys.stderr.write(f"[{stage}] {message}\n")
        sys.stderr.flush()
    except Exception:
        pass

# Global EasyOCR Reader Singleton
_EASYOCR_READER = None

def get_easyocr_reader():
    global _EASYOCR_READER
    if _EASYOCR_READER is None:
        has_cuda = torch.cuda.is_available()
        log_progress("OCR Init", f"กำลังโหลด EasyOCR Engine (CUDA GPU: {has_cuda}, CPU Threads: {cpu_cores})...")
        _EASYOCR_READER = easyocr.Reader(['th', 'en'], gpu=has_cuda)
    return _EASYOCR_READER

def enhance_crop_stamp(crop_img):
    """
    Enhances top-right stamp & document date header region
    Applies CLAHE and sharpening for maximum OCR accuracy.
    """
    if crop_img is None or crop_img.size == 0:
        return None
    try:
        gray = cv2.cvtColor(crop_img, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=3.5, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        sharpen_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        sharpened = cv2.filter2D(enhanced, -1, sharpen_kernel)
        bgr_enhanced = cv2.cvtColor(sharpened, cv2.COLOR_GRAY2BGR)
        return bgr_enhanced
    except Exception:
        return crop_img

def sort_ocr_results(results):
    """
    Sorts EasyOCR bounding boxes into horizontal lines (Y-tolerance 25px)
    and sorts words left-to-right within each line.
    """
    if not results:
        return ""
    
    items = []
    for item in results:
        bbox, text, prob = item
        if not text or not text.strip():
            continue
        y_center = (bbox[0][1] + bbox[2][1]) / 2.0
        x_left = bbox[0][0]
        items.append({
            "y": y_center,
            "x": x_left,
            "text": text.strip()
        })
    
    if not items:
        return ""
    
    items.sort(key=lambda it: it["y"])
    lines = []
    current_line = [items[0]]
    
    for it in items[1:]:
        avg_y = sum(item["y"] for item in current_line) / len(current_line)
        if abs(it["y"] - avg_y) <= 25:
            current_line.append(it)
        else:
            lines.append(current_line)
            current_line = [it]
    if current_line:
        lines.append(current_line)
    
    output_lines = []
    for line in lines:
        line.sort(key=lambda item: item["x"])
        line_text = " ".join(item["text"] for item in line)
        output_lines.append(line_text)
    
    return "\n".join(output_lines)

def process_ocr(file_path):
    if not os.path.exists(file_path):
        return {"success": False, "error": f"File not found: {file_path}"}
    
    reader = get_easyocr_reader()
    ext = os.path.splitext(file_path)[1].lower()
    text_pages = []
    
    if ext == '.pdf':
        try:
            doc = fitz.open(file_path)
            num_pages = len(doc)
            max_scan_pages = min(2, num_pages)
            log_progress("OCR 1/3", f"เปิดไฟล์ PDF สำเร็จ ({num_pages} หน้า, ประมวลผล {max_scan_pages} หน้าแรก)...")
            
            for page_num in range(max_scan_pages):
                log_progress("OCR 2/3", f"[หน้า {page_num + 1}] Render ภาพ 150 DPI (Direct RAM)...")
                page = doc.load_page(page_num)
                pix = page.get_pixmap(dpi=150)
                
                # Direct In-Memory Decode
                img_bytes = np.frombuffer(pix.tobytes("png"), np.uint8)
                img = cv2.imdecode(img_bytes, cv2.IMREAD_COLOR)
                
                if img is not None:
                    h, w = img.shape[:2]
                    
                    # 🎯 1. Crop Stamp & Header ROI ONLY on Page 1
                    txt_stamp = ""
                    if page_num == 0:
                        log_progress("OCR 3/3", f"[หน้า 1] Crop ตราประทับและส่วนหัวเอกสาร (มุมขวาบน)...")
                        stamp_crop = img[0:int(h * 0.35), int(w * 0.35):w]
                        prep_stamp = enhance_crop_stamp(stamp_crop)
                        if prep_stamp is not None:
                            res_stamp = reader.readtext(prep_stamp, canvas_size=1000)
                            txt_stamp = sort_ocr_results(res_stamp)
                    
                    # 🎯 2. Full Page Scan
                    log_progress("OCR 3/3", f"[หน้า {page_num + 1}] สแกนเนื้อหาภาพรวมทั้งหน้า...")
                    res_full = reader.readtext(img, canvas_size=1280)
                    txt_full = sort_ocr_results(res_full)
                    
                    # Order: Stamp & Top Header text FIRST, then Full Page text
                    parts = []
                    if txt_stamp: parts.append(txt_stamp)
                    if txt_full: parts.append(txt_full)
                    
                    combined_page_text = "\n".join(parts)
                    text_pages.append(combined_page_text.strip())
        except Exception as e:
            return {"success": False, "error": f"Failed to process PDF: {str(e)}"}
    else:
        try:
            log_progress("OCR 1/3", "กำลังโหลดไฟล์รูปภาพ...")
            img = cv2.imread(file_path, cv2.IMREAD_COLOR)
            if img is None:
                return {"success": False, "error": f"Failed to load image: {file_path}"}
            
            h, w = img.shape[:2]
            
            stamp_crop = img[0:int(h * 0.35), int(w * 0.35):w]
            prep_stamp = enhance_crop_stamp(stamp_crop)
            txt_stamp = ""
            if prep_stamp is not None:
                res_stamp = reader.readtext(prep_stamp, canvas_size=1000)
                txt_stamp = sort_ocr_results(res_stamp)
                
            res_full = reader.readtext(img, canvas_size=1280)
            txt_full = sort_ocr_results(res_full)
            
            parts = []
            if txt_stamp: parts.append(txt_stamp)
            if txt_full: parts.append(txt_full)
                
            text_pages.append("\n".join(parts))
        except Exception as e:
            return {"success": False, "error": f"Failed to process Image: {str(e)}"}
            
    log_progress("OCR Complete", "สแกนข้อความเสร็จสิ้นสมบูรณ์!")
    full_text = "\n\n--- Page Break ---\n\n".join(text_pages)
    return {"success": True, "text": full_text}

if __name__ == '__main__':
    if sys.stdout.encoding != 'utf-8':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No file path provided"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    result = process_ocr(file_path)
    print(json.dumps(result, ensure_ascii=False))
