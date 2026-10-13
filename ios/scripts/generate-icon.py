#!/usr/bin/env python3
"""Render the shared folded-m SVG into opaque iOS and web touch icons.

Uses only the Python standard library. iOS supplies its own corner mask.
"""
import json
import math
from pathlib import Path
import re
import struct
import xml.etree.ElementTree as ET
import zlib

repo = Path(__file__).resolve().parents[2]
brand = repo / 'web/public/brand'
source = ET.parse(brand / 'mailthing-mark.svg').getroot()
ns = {'svg': 'http://www.w3.org/2000/svg'}
rect = source.find('svg:rect', ns)
path = source.find('svg:path', ns)
view_size = float(source.attrib['viewBox'].split()[2])
# The master mark uses absolute M/L segments, round caps and round joins.
commands = re.findall(r'([ML])\s+([\d.]+)\s+([\d.]+)', path.attrib['d'])
points = [(float(x), float(y)) for _, x, y in commands]
radius = float(path.attrib['stroke-width']) / 2


def rgb(value):
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))


background = rgb(rect.attrib['fill'])
foreground = rgb(path.attrib['stroke'])


def distance(x, y, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


def render(size, destination):
    scale = size / view_size
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            px, py = (x + .5) / scale, (y + .5) / scale
            edge = min(distance(px, py, a, b) for a, b in zip(points, points[1:]))
            coverage = max(0, min(1, (radius - edge) * scale + .5))
            rows.extend(round(bg + (fg - bg) * coverage) for bg, fg in zip(background, foreground))
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
    destination.write_bytes(png)


root = repo / 'ios/Mailthing/Assets.xcassets'
folder = root / 'AppIcon.appiconset'
folder.mkdir(parents=True, exist_ok=True)
render(1024, folder / 'AppIcon.png')
render(180, brand / 'apple-touch-icon.png')
info = {'author': 'xcode', 'version': 1}
(root / 'Contents.json').write_text(json.dumps({'info': info}, indent=2) + '\n')
(folder / 'Contents.json').write_text(json.dumps({
    'images': [{'filename': 'AppIcon.png', 'idiom': 'universal', 'platform': 'ios', 'size': '1024x1024'}],
    'info': info,
}, indent=2) + '\n')
