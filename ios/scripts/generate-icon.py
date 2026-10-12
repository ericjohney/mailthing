#!/usr/bin/env python3
"""Generate the app's envelope icon using only Python's standard library."""
import json
import math
from pathlib import Path
import struct
import zlib

root = Path(__file__).resolve().parents[1] / 'Mailthing/Assets.xcassets'
folder = root / 'AppIcon.appiconset'
folder.mkdir(parents=True, exist_ok=True)

def distance(x, y, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
    return math.hypot(x-a[0]-t*dx, y-a[1]-t*dy)

rows = bytearray()
for y in range(1024):
    rows.append(0)
    for x in range(1024):
        t = (x+y)/2048
        color = (int(22+10*t), int(66+31*t), int(153+52*t))
        cx, cy = max(238, min(786, x)), max(345, min(679, y))
        if 174 <= x <= 850 and 281 <= y <= 743 and math.hypot(x-cx, y-cy) <= 64:
            color = (255, 255, 255)
            if min(distance(x,y,(190,716),(392,524)), distance(x,y,(834,716),(632,524))) < 9:
                color = (220,230,248)
            if min(distance(x,y,(178,319),(512,566)), distance(x,y,(512,566),(846,319))) < 18:
                color = (34,85,175)
        rows.extend(color)

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind+data))

png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB',1024,1024,8,2,0,0,0)) + chunk(b'IDAT',zlib.compress(rows)) + chunk(b'IEND', b'')
(folder / 'AppIcon.png').write_bytes(png)
info = {'author': 'xcode', 'version': 1}
(root / 'Contents.json').write_text(json.dumps({'info': info}, indent=2)+'\n')
(folder / 'Contents.json').write_text(json.dumps({'images': [{'filename': 'AppIcon.png', 'idiom': 'universal', 'platform': 'ios', 'size': '1024x1024'}], 'info': info}, indent=2)+'\n')
