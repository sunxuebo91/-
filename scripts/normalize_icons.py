import os
from PIL import Image

BASE = "miniprogram/images/icons_v2"
OUT = os.path.join(BASE, "norm")
os.makedirs(OUT, exist_ok=True)

CANVAS = 256          # output square size (px)
TARGET_FILL = 0.82    # longest content edge occupies this fraction of canvas

names = [
    "yuexin.png", "yuer.png", "baomu.png", "hulao.png", "wallet.png",
    "auth-heart-pulse.png", "flow-contract.png", "yuezican.png", "flow-heart.png",
    "cuiru.png", "flow-service.png", "clock.png",
    "auth-shield.png", "fushi.png", "zaojiao.png", "work-yuer.png",
    "flow-support.png",
]


def content_bbox(im):
    alpha = im.getchannel("A")
    amin, _ = alpha.getextrema()
    if amin < 250:
        return alpha.point(lambda a: 255 if a > 16 else 0).getbbox()
    gray = im.convert("L")
    return gray.point(lambda p: 0 if p > 244 else 255).getbbox()


for n in names:
    src = os.path.join(BASE, n)
    if not os.path.exists(src):
        print(f"SKIP missing {n}")
        continue
    im = Image.open(src).convert("RGBA")
    bbox = content_bbox(im)
    if not bbox:
        print(f"SKIP no-content {n}")
        continue
    content = im.crop(bbox)
    cw, ch = content.size
    target_px = CANVAS * TARGET_FILL
    scale = target_px / max(cw, ch)
    nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
    content = content.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(content, ((CANVAS - nw) // 2, (CANVAS - nh) // 2), content)
    canvas.save(os.path.join(OUT, n))
    print(f"OK {n:24s} {cw}x{ch} -> {nw}x{nh}")

print("Done ->", OUT)
