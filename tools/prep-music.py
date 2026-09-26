# Copy the player's uploaded songs into game/music/ (git-ignored: the repo is public).
# Long files are cut on an MP3 frame boundary to stay under the artifact's 15 MB
# per-file limit; the Xing VBR header (frame count, byte count, seek TOC) is rewritten.
# Usage: python3 tools/prep-music.py [upload_dir]
import os, sys, glob
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else '/root/.claude/uploads/dd6904cd-2b6b-5657-9838-0cbdd9c16f7b'
out = os.path.join(root, 'game', 'music')
os.makedirs(out, exist_ok=True)
SONGS = [('Crossing_The_Sea', 'crossing-the-sea.mp3'), ('Flight_to_Space', 'flight-to-space.mp3'), ('Lake_Theme', 'lake-theme.mp3')]
LIMIT = 14_200_000
BR = [None, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, None]
SR = [44100, 48000, 32000]

def frames(d, i):
    fr = []
    while i + 4 <= len(d):
        h = d[i:i + 4]
        if h[0] == 0xFF and (h[1] & 0xE0) == 0xE0 and ((h[1] >> 3) & 3) == 3 and ((h[1] >> 1) & 3) == 1:
            bri, sri, pad = (h[2] >> 4) & 15, (h[2] >> 2) & 3, (h[2] >> 1) & 1
            if bri not in (0, 15) and sri != 3:
                fl = 144 * BR[bri] * 1000 // SR[sri] + pad
                fr.append((i, fl, 1152 / SR[sri]))
                i += fl
                continue
        i += 1
    return fr

for key, name in SONGS:
    cands = sorted(glob.glob(os.path.join(src, f'*{key}*.mp3')))
    if not cands: print('missing', key); continue
    d = bytearray(open(cands[0], 'rb').read())
    start = 0
    if d[:3] == b'ID3': start = 10 + ((d[6] << 21) | (d[7] << 14) | (d[8] << 7) | d[9])
    fr = frames(d, start)
    xing = d.find(b'Xing', fr[0][0], fr[0][0] + 64)
    audio = fr[1:] if xing >= 0 else fr  # first frame carries the Xing header
    keep = audio
    if len(d) > LIMIT:
        tot, keep = fr[0][1] + start, []
        for f in audio:
            if tot + f[1] > LIMIT: break
            keep.append(f); tot += f[1]
    body = bytearray()
    for (p, fl, _) in keep: body += d[p:p + fl]
    head = bytearray(d[start:fr[0][0] + fr[0][1]]) if xing >= 0 else bytearray()
    if xing >= 0 and len(keep) != len(audio):
        x = xing - start
        nbytes = len(head) + len(body)
        head[x + 8:x + 12] = len(keep).to_bytes(4, 'big')
        head[x + 12:x + 16] = nbytes.to_bytes(4, 'big')
        # seek table: byte offset (as 1/256 of the file) at each percent of the duration
        dur = sum(f[2] for f in keep); acc = 0; pos = len(head); toc = []; j = 0
        offs = []
        for f in keep: offs.append((acc, pos)); acc += f[2]; pos += f[1]
        for k in range(100):
            tgt = dur * k / 100
            while j + 1 < len(offs) and offs[j + 1][0] <= tgt: j += 1
            toc.append(min(255, offs[j][1] * 256 // nbytes))
        head[x + 16:x + 116] = bytes(toc)
    data = bytes(d[:start]) + bytes(head) + bytes(body)
    open(os.path.join(out, name), 'wb').write(data)
    print(name, len(data), 'bytes', round(sum(f[2] for f in keep)), 's', '(cut)' if len(keep) != len(audio) else '')
