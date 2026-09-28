from pathlib import Path
from shutil import copy2
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT=Path(__file__).resolve().parents[1]
MAPS=ROOT/"public/images/campaign/maps"
BASE=MAPS/"red-frame-uniform-base"
BLANKS=MAPS/"uniform-name-blanks"
OUTPUT=MAPS/"red-frame-uniform-preview"
FONT=Path(r"C:\Windows\Fonts\msjhbd.ttc")

DATA={
"M02":("安德斯修道院",(375,170,685,256)),
"M03":("謝夫特拉恩修道院",(170,260,527,347)),
"M04":("瓦瑟堡",(327,273,672,382)),
"M10":("彭茨貝格",(175,283,530,372)),
"M11":("泰根湖修道院",(310,278,650,370)),
"M13":("菲森修道院",(212,249,557,348)),
"M14":("維爾茨堡",(35,274,400,375)),
"M15":("阿亨瓦爾德",(92,253,472,365)),
"M20":("斯洛施堡",(235,199,635,301)),
}

def feather_mask(size,feather=7):
 m=Image.new("L",size,0); d=ImageDraw.Draw(m)
 d.rectangle((feather,feather,size[0]-feather-1,size[1]-feather-1),fill=255)
 return m.filter(ImageFilter.GaussianBlur(feather/2))

def fit_font(draw,text,box):
 maxw=box[2]-box[0]-54; maxh=box[3]-box[1]-24
 for size in range(34,17,-1):
  f=ImageFont.truetype(str(FONT),size)
  b=draw.textbbox((0,0),text,font=f,stroke_width=1)
  if b[2]-b[0]<=maxw and b[3]-b[1]<=maxh:return f
 return ImageFont.truetype(str(FONT),18)

OUTPUT.mkdir(parents=True,exist_ok=True)
for n in range(1,21):
 code=f"M{n:02d}"; dst=OUTPUT/f"{code}-front.webp"
 if code not in DATA:
  copy2(BASE/f"{code}-front.webp",dst); continue
 image=Image.open(BASE/f"{code}-front.webp").convert("RGB")
 blank=Image.open(BLANKS/f"{code}-blank.png").convert("RGB")
 text,box=DATA[code]
 patch=blank.crop(box)
 image.paste(patch,box[:2],feather_mask(patch.size))
 draw=ImageDraw.Draw(image); font=fit_font(draw,text,box)
 b=draw.textbbox((0,0),text,font=font,stroke_width=1)
 x=box[0]+(box[2]-box[0]-(b[2]-b[0]))/2-b[0]
 y=box[1]+(box[3]-box[1]-(b[3]-b[1]))/2-b[1]
 draw.text((round(x),round(y)),text,font=font,fill=(31,20,14),stroke_width=1,stroke_fill=(255,239,205))
 image.save(dst,"WEBP",quality=95,method=6)

sheet=Image.new("RGB",(2880,2100),(5,13,14))
for n in range(1,21):
 code=f"M{n:02d}"
 sheet.paste(Image.open(OUTPUT/f"{code}-front.webp").convert("RGB"),(((n-1)%4)*720,((n-1)//4)*420))
sheet.save(OUTPUT/"contact-sheet.jpg",quality=95,subsampling=0)
