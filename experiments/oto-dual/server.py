#!/usr/bin/env python3
"""Single-instance signaling + static files. Media stays peer-to-peer on the LAN."""
import json, os, secrets, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
ROOT = Path(__file__).resolve().parent
ROOMS = {}
LOCK = threading.Lock()
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, *a): pass # Do not log pairing credentials.
    def reply(self, code, data):
        b=json.dumps(data).encode(); self.send_response(code)
        self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b)
    def end_headers(self):
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('X-Content-Type-Options','nosniff')
        super().end_headers()
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/health': return self.reply(200, {'ok':True})
        if path.startswith('/api/'): return self.reply(405, {'error':'Use POST'})
        if path not in ('/','/index.html','/dual.js','/camera-fx/','/camera-fx/index.html','/test-pattern/','/test-pattern/index.html'):
            return self.reply(404, {'error':'Not found'})
        return super().do_GET()
    def do_POST(self):
        try:
            n=int(self.headers.get('Content-Length','0'))
            if not 0<n<131072: return self.reply(413, {'error':'Request too large'})
            d=json.loads(self.rfile.read(n))
            if not isinstance(d,dict): raise ValueError()
            path=urlsplit(self.path).path
            with LOCK:
                now=time.monotonic()
                for k in list(ROOMS):
                    if now-ROOMS[k]['touched']>3600: del ROOMS[k]
                if path=='/api/create':
                    if len(ROOMS)>=50: return self.reply(503, {'error':'部屋が満杯です。後で試してください。'})
                    room=secrets.token_hex(16); token=secrets.token_hex(24)
                    ROOMS[room]={'token':token,'offer':None,'answer':None,'touched':now}
                    return self.reply(200, {'room':room,'token':token})
                room=d.get('room'); r=ROOMS.get(room) if isinstance(room,str) else None
                if not r: return self.reply(404, {'error':'部屋がありません。親で新しいリンクを作ってください。'})
                if path in ('/api/offer','/api/answer-state','/api/delete'):
                    if not secrets.compare_digest(str(d.get('token','')),r['token']): return self.reply(403, {'error':'Forbidden'})
                if path in ('/api/offer','/api/answer'):
                    desc=d.get('description'); kind=path.rsplit('/',1)[1]
                    if not isinstance(desc,dict) or desc.get('type')!=kind or not isinstance(desc.get('sdp'),str) or not desc['sdp'].startswith('v=0'): raise ValueError()
                    if r[kind] is not None: return self.reply(409, {'error':'このリンクは使用済みです。親で新しいリンクを作ってください。'})
                    if kind=='answer' and r['offer'] is None: return self.reply(409, {'error':'親が準備中です。'})
                    r[kind]=desc; r['touched']=now
                    return self.reply(200, {'ok':True})
                if path=='/api/offer-state': result={'description':r['offer']}
                elif path=='/api/answer-state': result={'description':r['answer']}
                elif path=='/api/delete': del ROOMS[room]; return self.reply(200,{'ok':True})
                else: return self.reply(404,{'error':'Not found'})
                r['touched']=now; return self.reply(200,result)
        except (ValueError,TypeError): self.reply(400, {'error':'Invalid request'})
if __name__=='__main__':
    port=int(os.environ.get('PORT','8001'))
    server=ThreadingHTTPServer(('0.0.0.0',port),Handler)
    print(f'Oto Dual: http://localhost:{port}',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: server.server_close()
