# Package the game + art: python3 tools/make-zip.py
import zipfile, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, 'dist', 'mudkip-beach-game.zip')
items = [('game/index.html', 'index.html'), ('dist/thumbnail.gif', 'thumbnail.gif'), ('dist/banner.gif', 'banner.gif'),
         ('dist/thumbnail.png', 'thumbnail.png'), ('dist/banner.png', 'banner.png')]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for src, name in items:
        z.write(os.path.join(root, src), 'mudkip-beach-game/' + name)
print(out, os.path.getsize(out) // 1024, 'KB')
with zipfile.ZipFile(out) as z:
    for i in z.infolist(): print(' ', i.filename, i.file_size // 1024, 'KB')
