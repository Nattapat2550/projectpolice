import sys
import json
import logging
import warnings
from paddleocr import PaddleOCR

# ปิด Warning ของ PaddleOCR เพื่อให้ stdout คลีน เป็น JSON อย่างเดียว
logging.getLogger("ppocr").setLevel(logging.ERROR)
warnings.filterwarnings("ignore")

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)

    file_path = sys.argv[1]

    try:
        # โหลดโมเดล PaddleOCR ภาษาไทย/อังกฤษ
        # show_log=False ป้องกันไม่ให้ PaddleOCR print อะไรออกมาปนกับ JSON
        ocr = PaddleOCR(use_angle_cls=True, lang='th', show_log=False, use_gpu=False)
        
        # รันการอ่าน
        result = ocr.ocr(file_path, cls=True)

        extracted_text_lines = []
        
        if result:
            for page in result:
                if page:
                    for line in page:
                        # โครงสร้าง line: [[box_points], [text, confidence]]
                        text = line[1][0]
                        extracted_text_lines.append(text)

        full_text = "\n".join(extracted_text_lines)
        
        # ส่งออกผลลัพธ์เป็น JSON กลับไปให้ Node.js
        print(json.dumps({"full_text": full_text}, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()
