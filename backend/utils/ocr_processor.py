import sys
import os
import json
import fitz  # PyMuPDF
import cv2
import easyocr

def process_ocr(file_path):
    if not os.path.exists(file_path):
        return {"success": False, "error": f"File not found: {file_path}"}
    
    # Initialize EasyOCR reader with Thai and English support
    reader = easyocr.Reader(['th', 'en'], gpu=False)
    ext = os.path.splitext(file_path)[1].lower()
    
    text_pages = []
    pid = os.getpid()
    
    if ext == '.pdf':
        try:
            doc = fitz.open(file_path)
            num_pages = len(doc)
            # *** OPTIMIZATION: Only scan the first 2 pages ***
            # Page 1 = Header (ที่, วันที่, เรื่อง, เรียน) + Body text
            # Page 2 = Sign-off (วันลงนาม, ผู้ลงนาม, การมอบหมาย)
            # Pages 3+ are typically attachments (เอกสารแนบ) and not needed for data extraction.
            max_scan_pages = min(2, num_pages)
            
            for page_num in range(max_scan_pages):
                page = doc.load_page(page_num)
                # Render page to image at 300 DPI for maximum OCR accuracy on Thai handwriting/fonts
                pix = page.get_pixmap(dpi=300)
                temp_img_path = os.path.join(os.path.dirname(file_path), f"temp_page_{pid}_{page_num}.png")
                pix.save(temp_img_path)
                
                # Load the rendered image
                img = cv2.imread(temp_img_path, cv2.IMREAD_COLOR)
                if img is not None:
                    # Perform OCR using EasyOCR
                    result = reader.readtext(img)
                    page_text = "\n".join([line[1] for line in result])
                    text_pages.append(page_text)
                
                # Clean up the temporary file immediately
                if os.path.exists(temp_img_path):
                    try:
                        os.remove(temp_img_path)
                    except Exception:
                        pass
        except Exception as e:
            return {"success": False, "error": f"Failed to process PDF: {str(e)}"}
    else:
        try:
            # Force load as a 3-channel color image
            img = cv2.imread(file_path, cv2.IMREAD_COLOR)
            if img is None:
                return {"success": False, "error": f"Failed to load image: {file_path}"}
            
            result = reader.readtext(img)
            text = ""
            if result:
                text = "\n".join([line[1] for line in result])
            text_pages.append(text)
        except Exception as e:
            return {"success": False, "error": f"Failed to process Image: {str(e)}"}
            
    full_text = "\n\n--- Page Break ---\n\n".join(text_pages)
    return {"success": True, "text": full_text}

if __name__ == '__main__':
    # Force UTF-8 stdout encoding for Thai characters
    if sys.stdout.encoding != 'utf-8':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No file path provided"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    result = process_ocr(file_path)
    print(json.dumps(result, ensure_ascii=False))
