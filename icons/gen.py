import struct, zlib

def make_png(size, color):
    w = h = size
    raw = bytearray()
    row_data = bytes([color[2], color[1], color[0]])
    for _ in range(h):
        raw.append(0)
        for _ in range(w):
            raw.extend(row_data)
    compressed = zlib.compress(bytes(raw))
    
    def chunk(t, d):
        cd = t + d
        return struct.pack('>I', len(d)) + cd + struct.pack('>I', zlib.crc32(cd) & 0xffffffff)
    
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', compressed) + chunk(b'IEND', b'')

with open('icon-192.png', 'wb') as f:
    f.write(make_png(192, (56, 189, 248)))
with open('icon-512.png', 'wb') as f:
    f.write(make_png(512, (30, 41, 59)))
print('OK')