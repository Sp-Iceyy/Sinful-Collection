from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import mimetypes
import re
import uuid
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
MEDIA = ROOT / 'Media'
IMAGE_MEDIA = MEDIA / 'Images'
VIDEO_MEDIA = MEDIA / 'Videos'
CATALOG = ROOT / 'metadata' / 'metadata.json'
MEDIA.mkdir(exist_ok=True)
IMAGE_MEDIA.mkdir(exist_ok=True)
VIDEO_MEDIA.mkdir(exist_ok=True)
CATALOG.parent.mkdir(exist_ok=True)


def read_catalog():
    try:
        data = json.loads(CATALOG.read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {'version': 1, 'profiles': {}}
    except (OSError, json.JSONDecodeError):
        return {'version': 1, 'profiles': {}}


def write_catalog(data):
    CATALOG.write_text(json.dumps(data, indent=2), encoding='utf-8')


def read_upload(stream, length, boundary, destination):
    marker = b'--' + boundary
    buffer = b''
    remaining = length
    while remaining and b'\r\n\r\n' not in buffer:
        chunk = stream.read(min(65536, remaining))
        if not chunk:
            break
        buffer += chunk
        remaining -= len(chunk)
    header_end = buffer.find(b'\r\n\r\n')
    if header_end < 0:
        raise ValueError('Invalid multipart upload')
    headers = buffer[:header_end].decode('utf-8', 'replace')
    filename_match = re.search(r'filename="([^"]*)"', headers)
    if not filename_match:
        raise ValueError('No file was provided')
    filename = Path(filename_match.group(1)).name
    content_match = re.search(r'\r\nContent-Type:\s*([^\r\n]+)', headers, re.IGNORECASE)
    content_type = content_match.group(1).strip().lower() if content_match else mimetypes.guess_type(filename)[0] or ''
    if content_type.startswith('image/'):
        destination = IMAGE_MEDIA
    elif content_type.startswith('video/'):
        destination = VIDEO_MEDIA
    else:
        raise ValueError('Only image and video files can be added')
    suffix = Path(filename).suffix.lower()
    safe_name = re.sub(r'[^A-Za-z0-9._-]+', '-', Path(filename).stem).strip('-') or 'upload'
    target = destination / f'{safe_name}-{uuid.uuid4().hex[:8]}{suffix}'
    buffer = buffer[header_end + 4:]
    closing = b'\r\n' + marker
    with target.open('wb') as output:
        while True:
            boundary_index = buffer.find(closing)
            if boundary_index >= 0:
                output.write(buffer[:boundary_index])
                break
            keep = len(closing) + 4
            if len(buffer) > keep:
                output.write(buffer[:-keep])
                buffer = buffer[-keep:]
            if not remaining:
                raise ValueError('Incomplete multipart upload')
            chunk = stream.read(min(65536, remaining))
            if not chunk:
                raise ValueError('Incomplete multipart upload')
            buffer += chunk
            remaining -= len(chunk)
    return target, content_type


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if self.path != '/api/upload':
            self.send_error(404)
            return
        content_type = self.headers.get('Content-Type', '')
        match = re.search(r'boundary=(?:"([^"]+)"|([^;]+))', content_type)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            boundary = (match.group(1) or match.group(2)).encode() if match else None
            if not boundary or not length:
                raise ValueError('Missing upload body')
            target, content_type = read_upload(self.rfile, length, boundary, MEDIA)
            folder = 'Images' if content_type.startswith('image/') else 'Videos'
            payload = {'name': target.name, 'filename': target.name, 'folder': folder, 'src': f'Media/{folder}/{target.name}', 'type': content_type}
            body = json.dumps(payload).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ValueError, OSError) as error:
            body = json.dumps({'error': str(error)}).encode()
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/catalog':
            profile = parse_qs(parsed.query).get('profile', [''])[0]
            data = read_catalog()
            payload = {'profiles': data.get('profiles', {}), 'media': data.get('profiles', {}).get(profile, {}).get('media', [])}
            body = json.dumps(payload).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_PUT(self):
        if self.path != '/api/catalog':
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            payload = json.loads(self.rfile.read(length))
            profile = str(payload.get('profile', '')).strip()
            if not profile:
                raise ValueError('Profile is required')
            data = read_catalog()
            data.setdefault('profiles', {})[profile] = {'username': profile, 'media': payload.get('media', []), 'favoriteTags': payload.get('favoriteTags', []), 'artists': payload.get('artists', []), 'folders': payload.get('folders', [])}
            write_catalog(data)
            body = b'{"ok":true}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ValueError, OSError, json.JSONDecodeError) as error:
            self.send_error(400, str(error))

    def do_DELETE(self):
        if self.path != '/api/catalog':
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            profile = str(json.loads(self.rfile.read(length)).get('profile', '')).strip()
            data = read_catalog()
            data.get('profiles', {}).pop(profile, None)
            write_catalog(data)
            self.send_response(200)
            self.send_header('Content-Length', '0')
            self.end_headers()
        except (ValueError, OSError, json.JSONDecodeError) as error:
            self.send_error(400, str(error))


if __name__ == '__main__':
    print('Serving Sinful Collection at http://localhost:8000/index.html')
    ThreadingHTTPServer(('localhost', 8000), Handler).serve_forever()
