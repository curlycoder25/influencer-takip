const origin = 'https://zhala-creator-desk.neighborlytoffee16.chatgpt.site';
const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const asset=(body,type,status=200)=>new Response(body,{status,headers:{...headers,'Content-Type':type}});
const html=(body,status)=>asset(body,'text/html; charset=utf-8',status);
const javascript=body=>asset(body,'application/javascript; charset=utf-8');
const json=(body,status=200)=>Response.json(body,{status,headers});
const encoder=new TextEncoder();
const sessionSeconds=8*60*60;
const cookieName='__Host-influencer-editor';
const directAccess=/^\/edit\/access\/([A-Za-z0-9_-]{43})$/;
const editRecord=/^\/edit\/api\/records\/[a-f0-9-]{36}$/;
function login(invalid=false) {
  const message=invalid?'<p class="error" role="alert">Kullanıcı adı veya şifre hatalı.</p>':'';
  return html(LOGIN_PAGE.replace('<!-- LOGIN_ERROR -->',message),invalid?401:200);
}
function linkLanding() {
  return html(`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Influencer Takip · Düzenleme</title><style>body{background:#f8f7fc;color:#25233a;font:16px system-ui;min-height:100vh;margin:0;display:grid;place-items:center}main{padding:24px}a{color:#6840ad}</style>
<main><h1>Düzenleme bağlantısı</h1><p id="status" role="status">Panel açılıyor…</p><a href="/">Canlı görünüme dön</a></main>
<script src="/edit/access.js" defer></script></html>`);
}
const keyFor=password=>crypto.subtle.importKey('raw',encoder.encode(password),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
const sign=async(key,value)=>new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));
const hex=bytes=>Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
const timestamp=()=>Math.floor(Date.now()/1000);
async function signedIn(request,key) {
  const raw=request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-influencer-editor=(\d{10})\.([a-f0-9]{64})(?:;|$)/);
  if(!raw || Number(raw[1])<=timestamp()) return false;
  const signature=Uint8Array.from(raw[2].match(/../g),byte=>parseInt(byte,16));
  return crypto.subtle.verify('HMAC',key,signature,encoder.encode('session:'+raw[1]));
}
async function createSession(request,key,username,password) {
  if(!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return login(true);
  const fields=new URLSearchParams(await request.text());
  const entered=fields.get('password')??'';
  if(fields.get('username')!==username) return login(true);
  if(entered.length>128 || !await crypto.subtle.verify('HMAC',key,await sign(key,'password:'+password),encoder.encode('password:'+entered))) return login(true);
  return grantSession(key,303);
}
async function grantSession(key,status) {
  const expires=timestamp()+sessionSeconds;
  const signature=hex(await sign(key,'session:'+expires));
  return new Response(null,{status,headers:{...headers,...(status===303?{Location:'/edit'}:{}),
    'Set-Cookie':`${cookieName}=${expires}.${signature}; Path=/; Max-Age=${sessionSeconds}; HttpOnly; Secure; SameSite=Strict`}});
}
async function linkAuthorized(sessionKey,linkKey,entered) {
  return Boolean(linkKey && entered && /^[A-Za-z0-9_-]{43}$/.test(entered) &&
    await crypto.subtle.verify('HMAC',sessionKey,await sign(sessionKey,'link:'+linkKey),encoder.encode('link:'+entered)));
}
async function createLinkSession(request,sessionKey,linkKey) {
  if(!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return json({error:'Geçersiz bağlantı'},401);
  const fields=new URLSearchParams(await request.text());
  if(!await linkAuthorized(sessionKey,linkKey,fields.get('key'))) return json({error:'Geçersiz bağlantı'},401);
  return grantSession(sessionKey,204);
}
async function sourceRecords(env,path='/api/records',body,method=body===undefined?'GET':'PUT') {
  if(!env.SOURCE_SITE_ACCESS) return json({error:'Kayıtlar kullanılamıyor'},503);
  try {
    const upstreamHeaders={'OAI-Sites-Authorization':'Bearer '+env.SOURCE_SITE_ACCESS};
    if(env.SHARED_PANEL_KEY) upstreamHeaders['X-Shared-Panel-Key']=env.SHARED_PANEL_KEY;
    if(body!==undefined) {
      upstreamHeaders.Origin=origin;
      upstreamHeaders['Content-Type']='application/json';
    }
    const response=await fetch(origin+path,{method,body,headers:upstreamHeaders,redirect:'manual'});
    if(!response.ok) {
      console.error('Source returned HTTP',response.status);
      if ([400,409].includes(response.status)) return json(await response.json(),response.status);
      return json({error:'Kayıtlar kullanılamıyor'},502);
    }
    const data=await response.json();
    if(body===undefined && !Array.isArray(data)) return json({error:'Kayıtlar kullanılamıyor'},502);
    return json(data);
  } catch (error) {
    console.error('Source request failed',error.name,error.message);
    return json({error:'Kayıtlar kullanılamıyor'},502);
  }
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url), path=url.pathname, method=request.method;
    if(method==='GET' && path==='/') return new Response(null,{status:303,headers:{...headers,Location:'/edit'}});
    if(method==='GET' && path==='/view') return html(PAGE);
    if(method==='GET' && path==='/app.js') return javascript(CLIENT);
    if(method==='GET' && ['/api/records','/api/brands'].includes(path)) return sourceRecords(env,path);
    if(method==='GET' && path==='/edit/access') return linkLanding();
    if(method==='GET' && path==='/edit/access.js') return javascript(ACCESS_CLIENT);
    const directKey=directAccess.exec(path)?.[1];
    if(!directKey && !['/edit','/edit/session','/edit/link-session','/edit/app.js','/edit/api/records','/edit/api/brands'].includes(path) && !editRecord.test(path)) {
      return json({error:'Bulunamadı'},404);
    }
    if(!env.EDITOR_PASSWORD) return json({error:'Düzenleme erişimi kullanılamıyor'},503);
    if(method!=='GET' && request.headers.get('Origin')!==url.origin) return json({error:'Erişim reddedildi'},403);
    const key=await keyFor(env.EDITOR_PASSWORD);
    if(method==='POST' && path==='/edit/session') return createSession(request,key,env.PANEL_USERNAME??'admin',env.PANEL_PASSWORD??env.EDITOR_PASSWORD);
    if(method==='POST' && path==='/edit/link-session') return createLinkSession(request,key,env.EDITOR_LINK_KEY);
    if(directKey) {
      if(method!=='GET') return json({error:'İşleme izin verilmiyor'},405);
      return await linkAuthorized(key,env.EDITOR_LINK_KEY,directKey)?html(EDITOR):json({error:'Geçersiz bağlantı'},401);
    }
    if(method==='GET' && path==='/edit/app.js') return javascript(EDITOR_CLIENT);
    const authorized=await signedIn(request,key) ||
      await linkAuthorized(key,env.EDITOR_LINK_KEY,request.headers.get('X-Editor-Link-Key'));
    if(method==='GET' && path==='/edit') return authorized?html(EDITOR):login();
    if(!authorized) return json({error:'Oturum açın'},401);
    if(method==='GET' && ['/edit/api/records','/edit/api/brands'].includes(path)) return sourceRecords(env,path.slice('/edit'.length));
    if(['POST','PUT','DELETE'].includes(method) && path==='/edit/api/brands') {
      if(!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Geçersiz istek'},400);
      const body=await request.text();
      if(body.length>84000) return json({error:'Geçersiz istek'},400);
      return sourceRecords(env,'/api/brands',body,method);
    }
    if(method==='PUT' && editRecord.test(path)) {
      if(!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Geçersiz istek'},400);
      const body=await request.text();
      if(body.length>250000) return json({error:'Geçersiz istek'},400);
      return sourceRecords(env,path.slice('/edit'.length),body);
    }
    return json({error:'İşleme izin verilmiyor'},405);
  }
};
