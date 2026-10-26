import io, json, unittest
from server import Handler, ROOMS
class Socket:
    def __init__(self,data): self.input=io.BytesIO(data); self.output=bytearray()
    def makefile(self,*a,**k): return self.input
    def sendall(self,b): self.output.extend(b)
def request(path,data):
    body=json.dumps(data).encode(); s=Socket(b'POST '+path.encode()+b' HTTP/1.0\r\nContent-Length: '+str(len(body)).encode()+b'\r\n\r\n'+body)
    Handler(s,('127.0.0.1',1234),None)
    head,b=bytes(s.output).split(b'\r\n\r\n',1)
    return int(head.split()[1]),json.loads(b)
class SignalingTests(unittest.TestCase):
    def setUp(self): ROOMS.clear()
    def test_offer_answer_and_one_receiver(self):
        code,room=request('/api/create',{}); self.assertEqual(code,200)
        offer={'type':'offer','sdp':'v=0\r\n'};answer={'type':'answer','sdp':'v=0\r\n'}
        self.assertEqual(request('/api/offer',{**room,'description':offer})[0],200)
        self.assertEqual(request('/api/offer-state',{'room':room['room']})[1]['description'],offer)
        self.assertEqual(request('/api/answer',{'room':room['room'],'description':answer})[0],200)
        self.assertEqual(request('/api/answer',{'room':room['room'],'description':answer})[0],409)
        self.assertEqual(request('/api/answer-state',room)[1]['description'],answer)
        self.assertEqual(request('/api/delete',room)[0],200)
        self.assertEqual(request('/api/offer-state',room)[0],404)
    def test_owner_auth_and_invalid_sdp(self):
        _,room=request('/api/create',{})
        self.assertEqual(request('/api/offer',{'room':room['room'],'description':{'type':'offer','sdp':'v=0'}})[0],403)
        self.assertEqual(request('/api/offer',{**room,'description':{'type':'answer','sdp':'bad'}})[0],400)
        self.assertEqual(request('/api/answer-state',{'room':room['room']})[0],403)
    def test_expired_room(self):
        _,room=request('/api/create',{}); ROOMS[room['room']]['touched']-=3601
        self.assertEqual(request('/api/offer-state',room)[0],404)
if __name__=='__main__': unittest.main()
