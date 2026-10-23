"""캐릭터 시트 이미지에서 표정 5개를 잘라 동그란 스티커 PNG로 만들어요. (한 번만 실행)
사용: python make_stickers.py 1.webp 2.webp"""
import sys
from PIL import Image, ImageDraw

KEYS = ["calm", "happy", "surprised", "serious", "excited"]
# (x0, y0, x1, y1) 표정 타일 위치
SHEETS = {
    "user1": [(37, 560, 257, 785), (273, 560, 485, 785), (500, 560, 712, 785), (728, 560, 940, 785), (957, 560, 1179, 785)],
    "user2": [(667, 95, 858, 372), (868, 95, 1058, 372), (1068, 95, 1260, 372), (1268, 95, 1458, 372), (1466, 95, 1656, 372)],
}

side_of = {"user1": 200, "user2": 215}
top_pad = {"user1": 22, "user2": 5}

def sticker(img, box, user):
    x0, y0, x1, y1 = box
    cx, side = (x0 + x1) // 2, side_of[user]
    top = y0 + top_pad[user]
    tile = img.crop((cx - side // 2, top, cx + side // 2, top + side)).convert("RGBA")  # 얼굴 중심 정사각형
    tile = tile.resize((256, 256), Image.LANCZOS)
    mask = Image.new("L", (256, 256), 0)
    ImageDraw.Draw(mask).ellipse((4, 4, 252, 252), fill=255)
    out = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    out.paste(tile, (0, 0), mask)
    return out

for (user, boxes), path in zip(SHEETS.items(), sys.argv[1:3]):
    img = Image.open(path)
    for key, box in zip(KEYS, boxes):
        sticker(img, box, user).save(f"public/stickers/{user}_{key}.png")
print("done")
