const options = {
  types: ['Aylık','Tek seferlik'],
  kinds: ['Story','Reels'],
  payments: ['pending','half','paid']
};
function readRecord(row) {
  const record = JSON.parse(row.data);
  if (record.type === 'Aylıq') record.type = 'Aylık';
  if (record.type === 'Birdəfəlik') record.type = 'Tek seferlik';
  record.paymentStatus ??= 'pending';
  return record;
}
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(value).toJSON()?.slice(0,10) === value;
const optionalDate = value => value === '' || date(value);
const string = (value,max) => typeof value === 'string' && value.length <= max;
const brandKey = name => name.normalize('NFKC').toLocaleLowerCase('tr');
const validBrand = name => string(name,80) && name === name.trim() && name.length>0 && !/[\u0000-\u001f\u007f]/.test(name);
const insertBrand = (db,name) => db.prepare('INSERT INTO brands (name_key,name) VALUES (?,?) ON CONFLICT(name_key) DO NOTHING').bind(brandKey(name),name);
async function listBrands(db) {
  const {results}=await db.prepare('SELECT name,logo FROM brands ORDER BY name COLLATE NOCASE').all();
  return results;
}
const validLogo = value => string(value,80000) && (value==='' || /^https:\/\/[^\s]+$/i.test(value) ||
  /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value));
async function changeBrand(request,db) {
  let input;
  try { input=await request.json(); } catch { return json({error:'Geçersiz istek'},400); }
  const {previous,name,logo=''}=input??{};
  if (request.method==='DELETE') {
    if (!validBrand(previous)) return json({error:'Geçersiz marka adı'},400);
    const result=await db.prepare("DELETE FROM brands WHERE name_key=? AND NOT EXISTS (SELECT 1 FROM collaborations WHERE json_extract(data,'$.brand')=brands.name)").bind(brandKey(previous)).run();
    return result.meta.changes?json({name:previous}):json({error:'Bu markayı silmeden önce bağlı iş birliklerini başka bir markaya taşı.'},409);
  }
  if (!validBrand(name) || !validLogo(logo)) {
    return json({error:'Marka adını ve logo görselini kontrol et.'},400);
  }
  if (request.method==='POST') {
    const result=await db.prepare('INSERT INTO brands (name_key,name,logo) VALUES (?,?,?) ON CONFLICT(name_key) DO NOTHING').bind(brandKey(name),name,logo).run();
    return result.meta.changes?json({name,logo},201):json({error:'Bu marka zaten var.'},409);
  }
  if (!validBrand(previous)) return json({error:'Geçersiz marka adı'},400);
  const oldKey=brandKey(previous),newKey=brandKey(name);
  const existing=await db.prepare('SELECT name_key FROM brands WHERE name_key=?').bind(newKey).first();
  if(existing && oldKey!==newKey) return json({error:'Bu marka zaten var.'},409);
  const [result]=await db.batch([
    db.prepare('UPDATE brands SET name_key=?,name=?,logo=? WHERE name_key=? AND name=?').bind(newKey,name,logo,oldKey,previous),
    db.prepare("UPDATE collaborations SET data=json_set(data,'$.brand',?) WHERE changes()>0 AND json_extract(data,'$.brand')=?").bind(name,previous)
  ]);
  return result.meta.changes?json({name,logo}):json({error:'Marka değişti. Listeyi yenile ve tekrar dene.'},409);
}
const link = value => string(value,1000) && (value === '' || /^https?:\/\/[^\s]+$/i.test(value));
const validTarget = value => value === null || (Number.isSafeInteger(value) && value >= 0);
function clean(record,id) {
  if (!record || !string(record.name,100) || !record.name.trim() || !string(record.handle,100) ||
      !validBrand(record.brand) || !options.types.includes(record.type) ||
      !date(record.start) || !optionalDate(record.end) || (record.end && record.end<record.start) ||
      !link(record.tracking) || !string(record.payment,250) || !string(record.notes,1500) ||
      !Array.isArray(record.items) || record.items.length>200) return null;
  const paymentStatus=record.paymentStatus ?? 'pending';
  if (!options.payments.includes(paymentStatus)) return null;
  const weeklyStories=record.type==='Aylık' ? (record.weeklyStories ?? null) : null;
  const monthlyStories=record.type==='Aylık' ? (record.monthlyStories ?? null) : null;
  const monthlyReels=record.type==='Aylık' ? (record.monthlyReels ?? null) : null;
  if (!validTarget(weeklyStories) || !validTarget(monthlyStories) || !validTarget(monthlyReels)) return null;
  const items=[];
  for (const item of record.items) {
    if (!item || !options.kinds.includes(item.kind) || !optionalDate(item.due) || !optionalDate(item.actual) || !link(item.url)) return null;
    const content=item.content??null;
    if(content && (typeof content.id!=='string' || !recordId.test(content.id) || !string(content.name,255) || !content.name.trim() ||
      !Number.isSafeInteger(content.size) || content.size<1 || content.size>1024**3)) return null;
    items.push({kind:item.kind,due:item.due,actual:item.actual,url:item.url,
      ...(content?{content:{id:content.id,name:content.name,size:content.size}}:{})});
  }
  const {name,handle,brand,type,start,end,tracking,payment,notes}=record;
  return {id,name,handle,brand,type,start,end,tracking,payment,paymentStatus,notes,items,weeklyStories,monthlyStories,monthlyReels};
}
const recordId = /^[a-f0-9-]{36}$/;
async function restore(request, db) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Geçersiz yedek'},400);
  let backup;
  try { backup=await request.json(); } catch { return json({error:'Geçersiz yedek'},400); }
  if (backup?.format !== 'influencer-takip' || backup.version !== 1 || !Array.isArray(backup.records)) {
    return json({error:'Geçersiz yedek'},400);
  }
  const savedBrands=backup.brands??[];
  if (!Array.isArray(savedBrands) || !savedBrands.every(entry=>validBrand(typeof entry==='string'?entry:entry?.name) && (typeof entry==='string' || validLogo(entry.logo)))) return json({error:'Geçersiz marka listesi'},400);
  const entries=[];
  const ids=new Set();
  for (const record of backup.records) {
    if (typeof record?.id !== 'string' || !recordId.test(record.id) || ids.has(record.id)) return json({error:'Geçersiz kayıt'},400);
    const validated=clean(record,record.id);
    if (!validated) return json({error:'Geçersiz kayıt'},400);
    ids.add(record.id);
    entries.push(validated);
  }
  const restoreRecords=db.prepare(
    "INSERT INTO collaborations (id,data) SELECT json_extract(value,'$.id'),value FROM json_each(?) WHERE true ON CONFLICT(id) DO NOTHING"
  ).bind(JSON.stringify(entries));
  const brands=new Map(entries.map(entry=>[brandKey(entry.brand),{name:entry.brand,logo:''}]));
  for(const entry of savedBrands) {
    const value=typeof entry==='string'?{name:entry,logo:''}:entry;
    brands.set(brandKey(value.name),value);
  }
  const restoreBrands=db.prepare("INSERT INTO brands (name_key,name,logo) SELECT json_extract(value,'$.key'),json_extract(value,'$.name'),json_extract(value,'$.logo') FROM json_each(?) WHERE true ON CONFLICT(name_key) DO NOTHING")
    .bind(JSON.stringify([...brands].map(([key,value])=>({key,...value}))));
  const [result]=await db.batch([restoreRecords,restoreBrands]);
  return json({added:result.meta.changes,existing:entries.length-result.meta.changes});
}
const json = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const asset = (body,type) => new Response(body,{headers:{'Cache-Control':'no-store','Content-Type':type,'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"}});
const encoder = new TextEncoder();
const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
async function isAuthorized(request,username,password) {
  const encoded=request.headers.get('Authorization')?.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i)?.[1];
  if(!encoded || encoded.length>4096) return false;
  let submitted;
  try { submitted=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(encoded),char=>char.charCodeAt(0))); }
  catch { return false; }
  const [expected,actual]=await Promise.all([digest(username+':'+password),digest(submitted)]);
  let difference=0;
  for(let i=0;i<expected.length;i++) difference|=expected[i]^actual[i];
  return difference===0;
}
export default {
  async fetch(request,env) {
    const username=env.PANEL_USERNAME??'admin';
    const password=env.PANEL_PASSWORD;
    if(!username || username.includes(':') || !password) return json({error:'Panel giriş ayarları eksik.'},503);
    const shared=request.headers.get('X-Shared-Panel-Key');
    const sharedRoute=(request.method==='GET' && ['/api/records','/api/brands'].includes(new URL(request.url).pathname)) ||
      (['POST','PUT','DELETE'].includes(request.method) && new URL(request.url).pathname==='/api/brands') ||
      (request.method==='PUT' && /^\/api\/records\/[a-f0-9-]{36}$/.test(new URL(request.url).pathname));
    const bridge=sharedRoute && env.SHARED_PANEL_KEY && shared===env.SHARED_PANEL_KEY;
    if(!bridge && !await isAuthorized(request,username,password)) {
      return new Response('Devam etmek için giriş yapın.',{status:401,headers:{
        'WWW-Authenticate':'Basic realm="Influencer Takip", charset="UTF-8"',
        'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'
      }});
    }
    const url=new URL(request.url);
    if(request.method==='GET' && url.pathname==='/') return asset(PAGE,'text/html; charset=utf-8');
    if(request.method==='GET' && url.pathname==='/app.js') return asset(CLIENT,'application/javascript; charset=utf-8');
    try {
      const content=contentRoute.exec(url.pathname);
      if(content && !content[1]) {
        if(request.method!=='GET' && request.headers.get('Origin')!==url.origin) return json({error:'Erişim reddedildi'},403);
        return await contentRequest(request,env,url,content);
      }
      if(url.pathname==='/api/brands') {
        if(request.method==='GET') return json(await listBrands(env.DB));
        if(['POST','PUT','DELETE'].includes(request.method)) {
          if(request.headers.get('Origin')!==url.origin) return json({error:'Erişim reddedildi'},403);
          return await changeBrand(request,env.DB);
        }
        return json({error:'İşleme izin verilmiyor'},405);
      }
      if(request.method==='GET' && url.pathname==='/api/records') {
        const {results}=await env.DB.prepare('SELECT data FROM collaborations').all();
        return json(results.map(readRecord));
      }
      if (request.method==='POST' && url.pathname==='/api/backup/restore') {
        if (request.headers.get('Origin')!==url.origin) return json({error:'Erişim reddedildi'},403);
        return await restore(request,env.DB);
      }
      const id=url.pathname.match(/^\/api\/records\/([a-f0-9-]{36})$/)?.[1];
      if(!id) return json({error:'Bulunamadı'},404);
      if(request.headers.get('Origin')!==url.origin) return json({error:'Erişim reddedildi'},403);
      if(request.method==='DELETE') {
        await env.DB.prepare('DELETE FROM collaborations WHERE id = ?').bind(id).run();
        return json({id});
      }
      if(request.method==='PUT') {
        if(!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Geçersiz istek'},400);
        const body=await request.text();
        if(body.length>250000) return json({error:'Geçersiz istek'},400);
        let record;
        try { record=clean(JSON.parse(body),id); } catch { return json({error:'Geçersiz istek'},400); }
        if(!record) return json({error:'Geçersiz veri'},400);
        const result=await env.DB.prepare('INSERT INTO collaborations (id,data) SELECT ?,? WHERE EXISTS (SELECT 1 FROM brands WHERE name=?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(id,JSON.stringify(record),record.brand).run();
        if(!result.meta.changes) return json({error:'Marka bulunamadı. Listeyi yenile.'},409);
        return json(record);
      }
      return json({error:'İşleme izin verilmiyor'},405);
    } catch (error) {
      console.error('Record operation failed',error);
      return json({error:'Veritabanına ulaşılamadı'},500);
    }
  }
};
