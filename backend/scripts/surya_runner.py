import sys
import json
import os
from PIL import Image

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided"}))
        sys.exit(0)
        
    image_path = sys.argv[1]
    
    if not os.path.exists(image_path):
        print(json.dumps({"error": f"File not found: {image_path}"}))
        sys.exit(0)

    try:
        # Load models on demand to save memory if not running continuously
        from surya.ocr import run_ocr
        from surya.model.detection.model import load_model as load_det_model, load_processor as load_det_processor
        from surya.model.recognition.model import load_model as load_rec_model
        from surya.model.recognition.processor import load_processor as load_rec_processor

        images = []
        if image_path.lower().endswith('.pdf'):
            import pypdfium2 as pdfium
            pdf = pdfium.PdfDocument(image_path)
            for i in range(len(pdf)):
                page = pdf.get_page(i)
                pil_image = page.render(scale=2).to_pil()
                images.append(pil_image)
        else:
            images.append(Image.open(image_path))

        langs = ["th", "en"]
        langs_list = [langs] * len(images)
        
        det_processor, det_model = load_det_processor(), load_det_model()
        rec_model, rec_processor = load_rec_model(), load_rec_processor()

        predictions = run_ocr(images, langs_list, det_model, det_processor, rec_model, rec_processor)
        
        text_lines = []
        for pred in predictions:
            if pred and hasattr(pred, 'text_lines'):
                for text_line in pred.text_lines:
                    text_lines.append(text_line.text)
                
        result = {"full_text": "\n".join(text_lines)}
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(0)

if __name__ == "__main__":
    main()
