"""將來源 PDF 的指定牌面裁切為圖片，不重繪或推測牌面內容。
需 PyMuPDF；pip install pymupdf 或使用本機 .tools/pdf-python。
"""
import hashlib
import json
from pathlib import Path
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'data/compendium.json').read_text())
source = ROOT / manifest['source']
pdf = pymupdf.open(source)
output = ROOT / 'public/images/compendium'
output.mkdir(parents=True, exist_ok=True)
for item in manifest['items']:
    page = pdf[item['page'] - 1]
    # 校對時的整頁渲染尺寸：前三頁為 1.4 倍，其餘為 1.5 倍。
    width, height = (834, 1179) if item['page'] <= 3 else (893, 1263)
    x0,y0,x1,y1 = item['crop']
    clip = pymupdf.Rect(x0/width*page.rect.width,y0/height*page.rect.height,
                       x1/width*page.rect.width,y1/height*page.rect.height)
    page.get_pixmap(matrix=pymupdf.Matrix(2,2), clip=clip).save(output / f"{item['slug']}.png")
print(f"Extracted {len(manifest['items'])} card images; PDF SHA-256: {hashlib.sha256(source.read_bytes()).hexdigest()}")
