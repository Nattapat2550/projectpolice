import sys
import json
import easyocr
import warnings

warnings.filterwarnings("ignore")

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)

    file_path = sys.argv[1]

    try:
        # Load EasyOCR for Thai and English
        # gpu=False because the user has Intel UHD graphics
        reader = easyocr.Reader(['th', 'en'], gpu=False, verbose=False)
        
        # Read text
        # detail=0 returns only the text strings
        result = reader.readtext(file_path, detail=0)

        full_text = "\n".join(result)
        
        print(json.dumps({"full_text": full_text}, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()
