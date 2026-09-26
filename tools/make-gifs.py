# Assemble GIFs from rendered frames: python3 tools/make-gifs.py framesDir outDir
import sys, os
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

def build(prefix, n, scale, ms, name, still):
    frames = [Image.open(f'{src}/{prefix}-{i:03d}.png').convert('RGB') for i in range(n)]
    w, h = frames[0].size
    # one shared palette for every frame (no flicker)
    cols = min(n, 16)
    mosaic = Image.new('RGB', (w * cols, h * ((n + cols - 1) // cols)))
    for i, f in enumerate(frames): mosaic.paste(f, ((i % cols) * w, (i // cols) * h))
    pal = mosaic.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    big = [f.resize((w * scale, h * scale), Image.NEAREST).quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    big[0].save(f'{out}/{name}.gif', save_all=True, append_images=big[1:], duration=ms, loop=0, disposal=1, optimize=False)
    frames[still].resize((w * scale, h * scale), Image.NEAREST).save(f'{out}/{name}.png', optimize=True)
    print(name, os.path.getsize(f'{out}/{name}.gif') // 1024, 'KB gif,', os.path.getsize(f'{out}/{name}.png') // 1024, 'KB png')

build('thumb', 60, 3, 50, 'thumbnail', 44)
build('banner', 32, 3, 60, 'banner', 5)
