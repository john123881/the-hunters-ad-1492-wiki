from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
MAPS=ROOT/"source-assets/campaign/maps"
SOURCE=Image.open(MAPS/"clear-back-sheet.png").convert("RGB")
OUT=MAPS/"red-frame-uniform-back-preview"
OUT.mkdir(parents=True,exist_ok=True)
X=[7,365,722,1080,1441]
Y=[7,221,430,640,845,1074]
for row in range(5):
 for col in range(4):
  code=f"M{row*4+col+1:02d}"
  card=SOURCE.crop((X[col],Y[row],X[col+1],Y[row+1]))
  card=card.resize((720,420),Image.Resampling.LANCZOS)
  card.save(OUT/f"{code}-back.webp","WEBP",quality=95,method=6)

revealed={"M02","M03","M04","M06","M07","M08","M09","M11","M12","M15","M16","M20"}
front=MAPS/"red-frame-uniform-preview"
sheet=Image.new("RGB",(2880,2100),(5,13,14))
for n in range(1,21):
 code=f"M{n:02d}"
 p=front/f"{code}-front.webp" if code in revealed else OUT/f"{code}-back.webp"
 sheet.paste(Image.open(p).convert("RGB"),(((n-1)%4)*720,((n-1)//4)*420))
sheet.save(OUT/"mixed-contact-sheet.jpg",quality=95,subsampling=0)
