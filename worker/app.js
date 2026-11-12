const $ = id => document.getElementById(id);
const brands = {'FastDrama':'#d65075','Yemek Market':'#eb654c','Amore':'#9564e2'};
const fields = ['name','handle','brand','type','start','end','tracking','payment','paymentStatus','notes'];
const paymentLabels = {pending:'Ödeme bekliyor',half:'İlk yarı ödendi',paid:'Tamamı ödendi'};
const form = $('form');
const targetFields = ['weeklyStories','monthlyReels'];
const syncTargets = () => {
  const monthly = form.elements.type.value === 'Aylık';
  $('monthlyTargets').hidden = !monthly;
  $('monthlyTargets').disabled = !monthly;
};
form.elements.type.onchange = syncTargets;
function targetSummary(record) {
  if (record.type !== 'Aylık') return '';
  const targets = [];
  if (record.weeklyStories != null) targets.push('Haftada ' + record.weeklyStories + ' Story');
  if (record.monthlyReels != null) targets.push('Ayda ' + record.monthlyReels + ' Reels');
  return targets.length ? '<small>Hedef · ' + targets.join(' · ') + '</small>' : '';
}
let records = [], brand = '', status = '', edit = null, ready = false, busy = false;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Famagusta'}).format(new Date());
const safeUrl = value => /^https?:\/\//i.test(value || '') ? escape(value) : '';
const stamp = value => value ? value.split('-').reverse().join('.') : '—';
const dot = name => '<i class="dot" style="--brand:'+brands[name]+'"></i>';
const published = record => record.items.filter(item => item.actual).length;
const overdue = record => record.items.filter(item => !item.actual && item.due && item.due < today()).length;
const dateOrder = record => record.items.filter(item => !item.actual && item.due).map(item => item.due).sort()[0] || '';
function render() {
  $('brands').innerHTML = '<small>Markalar</small>'+['',...Object.keys(brands)].map(name =>
    '<button data-brand="'+name+'" class="'+(brand===name?'active':'')+'" aria-pressed="'+(brand===name)+'">'+(name?dot(name):'▦')+' '+(name||'Tüm markalar')+'</button>').join('');
  if (!ready) return;
  const query = $('search').value.trim().toLocaleLowerCase('tr');
  const month = $('month').value;
  const filtered = records.filter(record => (!brand || record.brand===brand) && (!$('filter').value || record.type===$('filter').value) &&
    (!month || (record.start.slice(0,7)<=month && (record.end||record.start).slice(0,7)>=month)) &&
    (!query || (record.name+' '+record.handle).toLocaleLowerCase('tr').includes(query)));
  const allItems = filtered.flatMap(record=>record.items);
  const counts = [['','İş birliği',filtered.length],['waiting','Bekleyen paylaşım',allItems.filter(item=>!item.actual).length],
    ['late','Geciken paylaşım',filtered.reduce((sum,record)=>sum+overdue(record),0)],['done','Paylaşılan',allItems.filter(item=>item.actual).length]];
  $('metrics').innerHTML = counts.map(([key,label,count])=>'<button class="metric" data-status="'+key+'" aria-pressed="'+(status===key)+'"><small>'+label+'</small><b>'+count+'</b></button>').join('');
  const shown = filtered.filter(record => !status || (status==='late' && overdue(record)) ||
    (status==='done' && published(record)) || (status==='waiting' && published(record)<record.items.length));
  shown.sort((a,b)=>(dateOrder(a)||'9999').localeCompare(dateOrder(b)||'9999') || b.start.localeCompare(a.start));
  if (!shown.length) {
    $('list').innerHTML = records.length ? '<div class="empty"><h3>Bu filtrelerle eşleşen iş birliği yok</h3><button data-reset>Filtreleri temizle</button></div>' :
      '<div class="empty"><h3>İlk iş birliğini ekle</h3><p>Influencer bilgilerini, markayı ve anlaştığınız paylaşımları kaydet.</p><button class="primary" data-add>+ İş birliği ekle</button></div>';
    return;
  }
  $('list').innerHTML = '<table class="table"><thead><tr><th>Influencer</th><th>Marka</th><th>Tür ve tarih</th><th>Paylaşım planı</th><th>Sıradaki paylaşım</th><th>Ödeme durumu</th><th></th></tr></thead><tbody>'+
    shown.map(record=>{
      const total=record.items.length, done=published(record), late=overdue(record), next=dateOrder(record);
      const story=record.items.filter(item=>item.kind==='Story').length;
      return '<tr><td><strong>'+escape(record.name)+'</strong><small>'+escape(record.handle)+'</small></td><td><span class="chip">'+dot(record.brand)+escape(record.brand)+
      '</span></td><td>'+escape(record.type)+'<small>'+stamp(record.start)+(record.end?' – '+stamp(record.end):'')+'</small></td><td><strong>'+done+'/'+total+'</strong>'+
      '<div class="track"><i style="width:'+(total?done/total*100:0)+'%"></i></div><small>'+story+' Story · '+(total-story)+' Reels</small>'+targetSummary(record)+'</td><td>'+
      (late?'<strong class="late">'+late+' gecikti</strong><small>'+stamp(next)+'</small>':next?stamp(next):total&&done===total?'<span class="ok">Tamamlandı</span>':'—')+
      '</td><td><span class="chip '+(record.paymentStatus==='paid'?'ok':'')+'">'+paymentLabels[record.paymentStatus]+'</span></td><td><button data-edit="'+escape(record.id)+'">Aç</button></td></tr>';
    }).join('')+'</tbody></table>';
}
function addItem(item={kind:'Story',due:'',actual:'',url:''}) {
  const row=document.createElement('div');
  row.className='item';
  row.innerHTML='<label>Format<select data-field="kind"><option>Story</option><option>Reels</option></select></label>'+
    '<label>Planlanan tarih<input type="date" data-field="due"></label><label>Paylaşım tarihi<input type="date" data-field="actual"></label>'+
    '<label>Paylaşım bağlantısı<input type="url" maxlength="1000" data-field="url" placeholder="https://…"></label>'+
    '<label class="check"><input type="checkbox" '+(item.actual?'checked':'')+'> Paylaşıldı</label>'+
    (safeUrl(item.url)?'<a href="'+safeUrl(item.url)+'" target="_blank" rel="noopener noreferrer">Kapatntıyı aç ↗</a>':'')+
    '<button type="button" class="late">Paylaşımı sil</button>';
  for(const input of row.querySelectorAll('[data-field]')) input.value=item[input.dataset.field]||'';
  const actual=row.querySelector('[data-field=actual]'), check=row.querySelector('[type=checkbox]');
  check.onchange=()=>{actual.value=check.checked?today():'';};
  actual.onchange=()=>{check.checked=Boolean(actual.value);};
  row.querySelector('button').onclick=()=>row.remove();
  $('items').append(row);
}
function open(record, draft=false) {
  if (!ready || busy) return;
  edit=draft?null:record;
  $('dialogTitle').textContent=edit?'İş birliğini düzenle':'Yeni iş birliği';
  $('formNotice').textContent='';
  $('remove').hidden=!edit;
  $('renew').hidden=!edit || edit.type!=='Aylık';
  const values=record || {brand:brand||'FastDrama',type:'Aylık',start:today()};
  for (const key of fields) form.elements[key].value=values[key]||(key==='paymentStatus'?'pending':'');
  for (const key of targetFields) form.elements[key].value=values[key]??'';
  syncTargets();
  $('items').replaceChildren();
  for (const item of values.items||[]) addItem(item);
  if (!$('dialog').open) $('dialog').showModal();
}
async function api(method, path='/api/records', data) {
  const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  if (!response.ok) throw Error(response.status===400?'Tarihleri ve bağlantıları kontrol et.':'Bilgiler kaydedilemedi veya yüklenemedi. Tekrar dene.');
  return response.json();
}
async function load() {
  try { records=await api('GET'); ready=true; $('notice').textContent=''; render(); }
  catch (error) {
    $('notice').textContent=error.message;
    $('list').innerHTML='<div class="empty"><button data-retry>Yeniden yükle</button></div>';
  }
}
async function mutate(method, path, data) {
  if (busy) return;
  busy=true;
  $('save').disabled=$('remove').disabled=$('renew').disabled=$('close').disabled=true;
  $('formNotice').textContent='';
  try {
    const saved=await api(method,path,data);
    records=records.filter(record=>record.id!==saved.id);
    if (method!=='DELETE') records.push(saved);
    $('dialog').close();
    render();
  } catch (error) { $('formNotice').textContent=error.message; }
  finally { busy=false; $('save').disabled=$('remove').disabled=$('renew').disabled=$('close').disabled=false; }
}
function shift(value) {
  if(!value) return '';
  const [year,month,day]=value.split('-').map(Number);
  const target=new Date(Date.UTC(year,month,1));
  const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(last,day));
  return target.toISOString().slice(0,10);
}
$('renew').onclick=()=>open({...edit,paymentStatus:'pending',start:shift(edit.start),end:shift(edit.end),
  items:edit.items.map(item=>({...item,due:shift(item.due),actual:'',url:''}))},true);
$('remove').onclick=()=>{
  if(edit && confirm('Bu iş birliği ve paylaşım planı silinsin mi?')) mutate('DELETE','/api/records/'+edit.id);
};
form.onsubmit=event=>{
  event.preventDefault();
  const data=Object.fromEntries(fields.map(key=>[key,form.elements[key].value.trim()]));
  if(!data.name) { $('formNotice').textContent='Influencer adını gir.'; return; }
  if(data.end && data.end<data.start) { $('formNotice').textContent='Bitiş tarihi başlangıç tarihinden önce olamaz.'; return; }
  if (data.type==='Aylık') {
    for (const key of targetFields) {
      const value=form.elements[key].valueAsNumber;
      data[key]=Number.isNaN(value)?null:value;
    }
  }
  data.items=[...$('items').children].map(row=>Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value.trim()])));
  data.id=edit?.id || form.dataset.newId || crypto.randomUUID();
  form.dataset.newId=data.id;
  mutate('PUT','/api/records/'+data.id,data);
};
$('dialog').addEventListener('close',()=>{delete form.dataset.newId;});
$('dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
$('close').onclick=()=>$('dialog').close();
$('addItem').onclick=()=>addItem();
$('add').onclick=()=>open();
$('brands').onclick=event=>{const button=event.target.closest('[data-brand]');if(button){brand=button.dataset.brand;status='';render();}};
$('metrics').onclick=event=>{const button=event.target.closest('[data-status]');if(button){status=button.dataset.status;render();}};
$('list').onclick=event=>{
  const button=event.target.closest('button');
  if(!button) return;
  if(button.hasAttribute('data-add')) open();
  if(button.hasAttribute('data-retry')) load();
  if(button.hasAttribute('data-reset')) {brand=status=$('filter').value=$('search').value=$('month').value='';render();}
  if(button.dataset.edit) open(records.find(record=>record.id===button.dataset.edit));
};
$('search').oninput=render;
$('filter').onchange=$('month').onchange=render;
const backupFile=$('backupFile');
const backupNotice=$('backupNotice');
function backupBusy(value) {
  $('downloadBackup').disabled=$('restoreBackup').disabled=value;
}
$('downloadBackup').onclick=async()=>{
  backupBusy(true);
  backupNotice.textContent='';
  try {
    const current=await api('GET');
    const backup={format:'influencer-takip',version:1,exportedAt:new Date().toISOString(),records:current};
    const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=url;
    link.download='influencer-takip-yedek-'+today()+'.json';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    backupNotice.textContent=current.length+' iş birliği yedeğe alındı.';
  } catch {
    backupNotice.textContent='Yedek indirilemedi. Tekrar dene.';
  } finally { backupBusy(false); }
};
$('restoreBackup').onclick=()=>backupFile.click();
backupFile.onchange=async()=>{
  const [file]=backupFile.files;
  backupFile.value='';
  if (!file) return;
  backupBusy(true);
  backupNotice.textContent='';
  try {
    const backup=JSON.parse(await file.text());
    const response=await fetch('/api/backup/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(backup)});
    if (response.status===400) throw new SyntaxError();
    if (!response.ok) throw new Error();
    const {added,existing}=await response.json();
    await load();
    backupNotice.textContent=added+' kayıt geri yüklendi. '+existing+' mevcut kayıt korundu.';
  } catch (error) {
    backupNotice.textContent=error instanceof SyntaxError?'Geçerli bir panel yedeği seç.':'Yedek geri yüklenemedi. Tekrar dene.';
  } finally { backupBusy(false); }
};
render();
load();
