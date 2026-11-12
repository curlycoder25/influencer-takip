const options = {
  brands: ['FastDrama','Yemek Market','Amore'],
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
const link = value => string(value,1000) && (value === '' || /^https?:\/\/[^\s]+$/i.test(value));
const validTarget = value => value === null || (Number.isSafeInteger(value) && value >= 0);
function clean(record,id) {
  if (!record || !string(record.name,100) || !record.name.trim() || !string(record.handle,100) ||
      !options.brands.includes(record.brand) || !options.types.includes(record.type) ||
      !date(record.start) || !optionalDate(record.end) || (record.end && record.end<record.start) ||
      !link(record.tracking) || !string(record.payment,250) || !string(record.notes,1500) ||
      !Array.isArray(record.items) || record.items.length>200) return null;
  const paymentStatus=record.paymentStatus ?? 'pending';
  if (!options.payments.includes(paymentStatus)) return null;
  const weeklyStories=record.type==='Aylık' ? (record.weeklyStories ?? null) : null;
  const monthlyReels=record.type==='Aylık' ? (record.monthlyReels ?? null) : null;
  if (!validTarget(weeklyStories) || !validTarget(monthlyReels)) return null;
  const items=[];
  for (const item of record.items) {
    if (!item || !options.kinds.includes(item.kind) || !optionalDate(item.due) || !optionalDate(item.actual) || !link(item.url)) return null;
    items.push({kind:item.kind,due:item.due,actual:item.actual,url:item.url});
  }
  const {name,handle,brand,type,start,end,tracking,payment,notes}=record;
  return {id,name,handle,brand,type,start,end,tracking,payment,paymentStatus,notes,items,weeklyStories,monthlyReels};
}
const recordId = /^[a-f0-9-]{36}$/;
async function restore(request, db) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Geçersiz yedek'},400);
  let backup;
  try { backup=await request.json(); } catch { return json({error:'Geçersiz yedek'},400); }
  if (backup?.format !== 'influencer-takip' || backup.version !== 1 || !Array.isArray(backup.records)) {
    return json({error:'Geçersiz yedek'},400);
  }
  const entries=[];
  const ids=new Set();
  for (const record of backup.records) {
    if (typeof record?.id !== 'string' || !recordId.test(record.id) || ids.has(record.id)) return json({error:'Geçersiz kayıt'},400);
    const validated=clean(record,record.id);
    if (!validated) return json({error:'Geçersiz kayıt'},400);
    ids.add(record.id);
    entries.push(validated);
  }
  const result=await db.prepare(
    "INSERT INTO collaborations (id,data) SELECT json_extract(value,'$.id'),value FROM json_each(?) WHERE true ON CONFLICT(id) DO NOTHING"
  ).bind(JSON.stringify(entries)).run();
  return json({added:result.meta.changes,existing:entries.length-result.meta.changes});
}
const json = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const asset = (body,type) => new Response(body,{headers:{'Content-Type':type,'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"}});
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(request.method==='GET' && url.pathname==='/') return asset(PAGE,'text/html; charset=utf-8');
    if(request.method==='GET' && url.pathname==='/app.js') return asset(CLIENT,'application/javascript; charset=utf-8');
    try {
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
        await env.DB.prepare('INSERT INTO collaborations (id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(id,JSON.stringify(record)).run();
        return json(record);
      }
      return json({error:'İşleme izin verilmiyor'},405);
    } catch (error) {
      console.error('Record operation failed',error);
      return json({error:'Veritabanına ulaşılamadı'},500);
    }
  }
};
