from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
MAPS=ROOT/"public/images/campaign/maps"
SHEET=Image.open(MAPS/"clear-front-sheet.png").convert("RGB")
OUT=MAPS/"red-frame-uniform-base"
OUT.mkdir(parents=True,exist_ok=True)
SIZE=(720,420)

# Midpoints of the photographed red divider bands.
X=[8,370,726,1079,1440]
Y=[7,213,418,624,836,1069]

for row in range(5):
    for photo_col in range(4):
        code=f"M{row*4+(4-photo_col):02d}"
        card=SHEET.crop((X[photo_col],Y[row],X[photo_col+1],Y[row+1]))
        card=card.resize(SIZE,Image.Resampling.LANCZOS)
        card.save(OUT/f"{code}-front.webp","WEBP",quality=95,method=6)

contact=Image.new("RGB",(2880,2100),(5,13,14))
for i in range(1,21):
    contact.paste(Image.open(OUT/f"M{i:02d}-front.webp"),(((i-1)%4)*720,((i-1)//4)*420))
contact.save(OUT/"contact-sheet.jpg",quality=95,subsampling=0)

