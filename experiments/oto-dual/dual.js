/* Oto Dual: one renderer, two viewports. No third-party media relay. */
(()=>{
'use strict';
const viewer=new URLSearchParams(location.hash.slice(1)).get('room');
const source=document.querySelector('canvas#gl');
if(!viewer&&!source)return;
const css=document.createElement('style');css.textContent=`
#dual-panel{position:fixed;z-index:1000;left:10px;right:10px;bottom:max(10px,env(safe-area-inset-bottom));padding:12px;background:rgba(15,20,17,.96);color:#fff;font:14px/1.5 system-ui;border:1px solid #7c9681;border-radius:12px;max-height:45vh;overflow:auto}
#dual-panel button,#dual-panel a{font:inherit;margin:4px;padding:8px 12px;border-radius:8px;border:0;background:#daf0da;color:#102010;display:inline-block}
#dual-panel input{box-sizing:border-box;width:100%;font:13px system-ui;padding:10px}
#dual-panel p{margin:6px 0}#dual-mini{position:fixed;right:8px;top:max(8px,env(safe-area-inset-top));z-index:1001;padding:8px;background:#def0de;color:#132218;border:1px solid #6e866b;border-radius:8px}
body.oto-wide #gl{width:200%!important;max-width:none!important;right:auto!important}
#dual-video{position:fixed;left:-100%;top:0;width:200%;height:100%;max-width:none;object-fit:fill;background:#000}
`;document.head.append(css);
const panel=document.createElement('section');panel.id='dual-panel';
panel.innerHTML='<b>2台でひとつの画面</b><p id="dual-status" role="status"></p><div id="dual-actions"></div>';
document.body.append(panel);
const status=panel.querySelector('#dual-status'),actions=panel.querySelector('#dual-actions');
const mini=document.createElement('button');mini.id='dual-mini';mini.textContent='2台表示';mini.onclick=()=>panel.hidden=!panel.hidden;document.body.append(mini);
const say=t=>status.textContent=t;
function button(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=fn;actions.append(b);return b;}
let pc=null,stream=null,room='',token='',run=0,watch=null;
window.OtoDual={active:false};
async function api(path,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});const d=await r.json();if(!r.ok)throw Error(d.error||'通信に失敗しました');return d;}finally{clearTimeout(timer);}}
function stop(){run++;clearInterval(watch);watch=null;if(pc){pc.close();pc=null;}if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}window.OtoDual.active=false;document.body.classList.remove('oto-wide');}
function peer(){const p=new RTCPeerConnection({iceServers:[]});pc=p;
 p.onconnectionstatechange=()=>{if(pc!==p)return;const s=p.connectionState;
 if(s==='connected')say('接続中：左＝親／右＝子。操作と音は親だけで行います。');
 if(['failed','disconnected','closed'].includes(s))say('接続が途切れました。同じWi-Fiを確認し、親で新しいリンクを作って接続し直してください。');};return p;}
async function gather(p){if(p.iceGatheringState==='complete')return;
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{p.removeEventListener('icegatheringstatechange',done);reject(Error('接続準備がタイムアウトしました。Wi-Fiを確認してください。'));},10000);
 function done(){if(p.iceGatheringState==='complete'){clearTimeout(timer);p.removeEventListener('icegatheringstatechange',done);resolve();}}p.addEventListener('icegatheringstatechange',done);done();});}
function usable(){if(!window.isSecureContext)throw Error('HTTPSの公開URLで開いてください（Macではlocalhostも使用できます）。');if(!window.RTCPeerConnection)throw Error('このブラウザーではWebRTCを使えません。Safariを更新してください。');}
if(viewer){
 document.body.style.cssText='margin:0;overflow:hidden;background:#000';
 document.querySelector('main')?.remove();
 const video=document.createElement('video');video.id='dual-video';video.playsInline=true;video.muted=true;video.autoplay=true;document.body.prepend(video);
 say('親と同じWi-Fi・同じ向きにしてください。カメラ・マイクは使いません。');
 const start=button('右画面を開始',async()=>{start.disabled=true;stop();const g=run;
 try{usable();const p=peer();p.ontrack=e=>{if(g!==run)return;video.srcObject=e.streams[0]||new MediaStream([e.track]);video.play().catch(()=>say('映像をタップして再生してください。'));};
 say('親の映像へ接続しています…');const d=await api('offer-state',{room:viewer});if(g!==run)return;
 if(!d.description)throw Error('親が準備中です。少し待って開始を押してください。');
 await p.setRemoteDescription(d.description);await p.setLocalDescription(await p.createAnswer());await gather(p);
 if(g!==run)return;await api('answer',{room:viewer,description:p.localDescription});
 // A connected ICE session can still have no decoded frames. Make that visible.
 let last=0,stalls=0;watch=setInterval(()=>{if(video.currentTime===last)stalls++;else stalls=0;last=video.currentTime;if(stalls>=8)say('映像が届いていません。親を前面に戻し、必要なら新しいリンクを作ってください。');},1000);
 }catch(e){if(g===run){stop();say(e.message);start.disabled=false;}}});
 video.onclick=()=>video.play().catch(()=>{});
 button('パネルを隠す',()=>panel.hidden=true);
}else{
 say('作品のSTARTで映像を出してから接続します。まず同じ機種・向きの2台で試してください。');
 const make=button('左画面を開始・共有リンクを作る',async()=>{make.disabled=true;const oldRoom=room,oldToken=token;stop();const g=run;
 try{usable();if(!source.captureStream)throw Error('Canvas配信に対応していません。Safariを更新してください。');
 if(oldRoom)api('delete',{room:oldRoom,token:oldToken}).catch(()=>{});
 say('接続を準備しています…');document.querySelector('#dual-link')?.remove();
 window.OtoDual.active=true;document.body.classList.add('oto-wide');
 // Wait for wide rendering before starting the encoder.
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const d=await api('create',{});if(g!==run)return;room=d.room;token=d.token;
 stream=source.captureStream(24);if(!stream.getVideoTracks().length)throw Error('映像トラックを作成できませんでした。');
 const p=peer();for(const t of stream.getTracks())p.addTrack(t,stream);
 await p.setLocalDescription(await p.createOffer());await gather(p);if(g!==run)return;
 await api('offer',{room,token,description:p.localDescription});
 const url=new URL('/',location.href);url.hash=new URLSearchParams({room}).toString();
 const group=document.createElement('div');group.id='dual-link';const input=document.createElement('input');input.readOnly=true;input.value=url.href;input.setAttribute('aria-label','子のiPhone用リンク');group.append(input);panel.append(group);
 const share=document.createElement('button');share.textContent='リンクを共有・コピー';share.onclick=async()=>{try{if(navigator.share)await navigator.share({title:'Oto II 右画面',url:url.href});else{await navigator.clipboard.writeText(url.href);say('コピーしました。子のSafariで開いてください。');}}catch(e){input.select();say('リンク欄を長押ししてコピーしてください。');}};group.append(share);
 say('子のSafariでこのリンクを開き「右画面を開始」を押してください。リンクは1回の接続専用です。');
 let busy=false,deadline=Date.now()+300000;
 watch=setInterval(async()=>{if(busy||g!==run)return;busy=true;try{if(Date.now()>deadline)throw Error('接続待ちが5分を超えました。新しいリンクを作ってください。');const a=await api('answer-state',{room,token});if(g!==run)return;if(a.description){await p.setRemoteDescription(a.description);clearInterval(watch);watch=null;}}catch(e){if(g===run){clearInterval(watch);say(e.message);}}finally{busy=false;}},700);
 }catch(e){if(g===run){stop();say(e.message);}}finally{make.disabled=false;}});
 button('終了',()=>{const r=room,t=token;stop();room=token='';document.querySelector('#dual-link')?.remove();if(r)api('delete',{room:r,token:t}).catch(()=>{});say('2台表示を終了しました。');});
 button('パネルを隠す',()=>panel.hidden=true);
 panel.hidden=true;
}
addEventListener('pagehide',stop);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&pc){say('アプリを切り替えると配信が止まる場合があります。復帰しない場合は新しいリンクで接続し直してください。');}});
})();
