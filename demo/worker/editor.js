const editorLinkKey = location.pathname.match(/^\/edit\/access\/([A-Za-z0-9_-]{43})$/)?.[1];
const $ = id => document.getElementById(id);
const brandColors = new Map([['FastDrama','#d65075'],['Yemek Market','#eb654c'],['Amore','#9564e2']]);
let registeredBrands = [...brandColors.keys()];
const brandName = entry => typeof entry==='string'?entry:entry.name;
const brandNames = () => [...new Set([...registeredBrands.map(brandName),...records.map(record=>record.brand)])];
const fields = ['name','handle','brand','type','start','end','tracking','payment','paymentStatus','notes'];
const paymentLabels = {pending:'Ödeme bekliyor',half:'İlk yarı ödendi',paid:'Tamamı ödendi'};
const form = $('form');
const targetFields = ['weeklyStories','monthlyStories','monthlyReels'];
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
  if (record.monthlyStories != null) targets.push('Ayda ' + record.monthlyStories + ' Story');
  if (record.monthlyReels != null) targets.push('Ayda ' + record.monthlyReels + ' Reels');
  return targets.length ? '<small>Hedef · ' + targets.join(' · ') + '</small>' : '';
}
let records = [], brand = '', status = '', edit = null, ready = false, busy = false;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Famagusta'}).format(new Date());
const safeUrl = value => /^https?:\/\//i.test(value || '') ? escape(value) : '';
const stamp = value => value ? value.split('-').reverse().join('.') : '—';
const dot = name => {
  const logo=registeredBrands.find(entry=>brandName(entry)===name)?.logo;
  return logo && /^(?:https:\/\/|data:image\/webp;base64,)/i.test(logo)
    ? '<img class="brand-logo" src="'+escape(logo)+'" alt="" referrerpolicy="no-referrer">'
    : '<i class="dot" style="--brand:'+(brandColors.get(name)||'#ac96ff')+'"></i>';
};
const published = record => record.items.filter(item => item.actual).length;
const overdue = record => record.items.filter(item => !item.actual && item.due && item.due < today()).length;
const dateOrder = record => record.items.filter(item => !item.actual && item.due).map(item => item.due).sort()[0] || '';
function render() {
  $('brands').innerHTML = '<small>Markalar</small>'+['',...brandNames()].map(name =>
    '<button data-brand="'+escape(name)+'" class="'+(brand===name?'active':'')+'" aria-pressed="'+(brand===name)+'">'+(name?dot(name):'▦')+' '+(escape(name)||'Tüm markalar')+'</button>').join('');
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
let activeUploads=0;
async function uploadContent(file,progress) {
  if(!file.size || file.size>1024**3 || file.name.length>255) throw Error('En fazla 1 GB boyutunda bir dosya seç.');
  const headers=editorLinkKey?{'X-Editor-Link-Key':editorLinkKey}:{};
  async function send(path,method,body) {
    const response=await fetch(path,{method,headers,body});
    if(!response.ok) throw Error('Dosya yüklenemedi. Tekrar dene.');
    return response.json();
  }
  const {id,uploadId,partSize}=await send('/edit/api/content','POST',JSON.stringify({name:file.name,size:file.size}));
  const url='/edit/api/content/'+id+'?uploadId='+encodeURIComponent(uploadId);
  const parts=[];
  try {
    for(let offset=0;offset<file.size;offset+=partSize) {
      const end=Math.min(offset+partSize,file.size);
      parts.push(await send(url+'&part='+(parts.length+1),'PUT',file.slice(offset,end)));
      progress.textContent='%'+Math.floor(100*end/file.size)+' yüklendi';
    }
    await send(url,'POST',JSON.stringify(parts));
    return {id,name:file.name,size:file.size};
  } catch(error) {
    await send(url,'DELETE').catch(()=>{});
    throw error;
  }
}
function attachContent(row,initial) {
  row.content=initial;
  const input=row.querySelector('[type=file]');
  const status=row.querySelector('.content-status');
  const refresh=()=>{
    status.replaceChildren();
    if(!row.content) return;
    const link=document.createElement('a');
    link.href='/api/content/'+row.content.id;
    link.textContent=row.content.name;
    status.append(link);
  };
  refresh();
  input.onchange=async()=>{
    const [file]=input.files;
    if(!file) return;
    activeUploads++;
    input.disabled=true;
    $('save').disabled=true;
    try {row.content=await uploadContent(file,status);refresh();}
    catch(error) {refresh();status.append(document.createTextNode(' '+error.message));}
    finally {input.value='';input.disabled=false;activeUploads--;$('save').disabled=activeUploads>0;}
  };
}
function addItem(item={kind:'Story',due:'',actual:'',url:''}) {
  const row=document.createElement('div');
  row.className='item';
  row.innerHTML='<label>Format<select data-field="kind"><option>Story</option><option>Reels</option></select></label>'+
    '<label>Planlanan tarih<input type="date" data-field="due"></label><label>Paylaşım tarihi<input type="date" data-field="actual"></label>'+
    '<label>Paylaşım bağlantısı<input type="url" maxlength="1000" data-field="url" placeholder="https://…"></label>'+
    '<label>İçerik<input type="file" aria-label="İçerik dosyası"><small class="content-status" role="status"></small></label>'+
    '<label class="check"><input type="checkbox" '+(item.actual?'checked':'')+'> Paylaşıldı</label>'+
    (safeUrl(item.url)?'<a href="'+safeUrl(item.url)+'" target="_blank" rel="noopener noreferrer">Bağlantıyı aç ↗</a>':'')+
    '<button type="button" class="late">Paylaşımı sil</button>';
  for(const input of row.querySelectorAll('[data-field]')) input.value=item[input.dataset.field]||'';
  const actual=row.querySelector('[data-field=actual]'), check=row.querySelector('[type=checkbox]');
  check.onchange=()=>{actual.value=check.checked?today():'';};
  actual.onchange=()=>{check.checked=Boolean(actual.value);};
  row.querySelector('button').onclick=()=>{if(!activeUploads)row.remove();};
  attachContent(row,item.content);
  $('items').append(row);
}
function open(record, draft=false) {
  if (!ready || busy) return;
  edit=draft?null:record;
  $('dialogTitle').textContent=edit?'İş birliğini düzenle':'Yeni iş birliği';
  $('formNotice').textContent='';
  $('renew').hidden=!edit || edit.type!=='Aylık';
  const values=record || {brand:brand||'FastDrama',type:'Aylık',start:today()};
  form.elements.brand.replaceChildren(...brandNames().map(name=>new Option(name,name)));
  for (const key of fields) form.elements[key].value=values[key]||(key==='paymentStatus'?'pending':'');
  for (const key of targetFields) form.elements[key].value=values[key]??'';
  syncTargets();
  $('items').replaceChildren();
  for (const item of values.items||[]) addItem(item);
  if (!$('dialog').open) $('dialog').showModal();
}
async function api(method, path='/edit/api/records', data) {
  const response=await fetch(path,{method,headers:{'Content-Type':'application/json',...(editorLinkKey?{'X-Editor-Link-Key':editorLinkKey}:{})},body:data?JSON.stringify(data):undefined});
  if (response.status===401) {
    if (!editorLinkKey) location.assign('/edit');
    throw Error('Oturum süresi doldu.');
  }
  if (!response.ok) {
    const result=await response.json().catch(()=>null);
    throw Error(result?.error||'Bilgiler kaydedilemedi veya yüklenemedi. Tekrar dene.');
  }
  return response.json();
}
async function load() {
  try { [records,registeredBrands]=await Promise.all([api('GET'),api('GET','/edit/api/brands')]); ready=true; $('notice').textContent=''; render(); }
  catch (error) {
    $('notice').textContent=error.message;
    $('list').innerHTML='<div class="empty"><button data-retry>Yeniden yükle</button></div>';
  }
}
async function mutate(method, path, data) {
  if (busy || activeUploads) return;
  busy=true;
  $('save').disabled=$('renew').disabled=$('close').disabled=true;
  $('formNotice').textContent='';
  try {
    const saved=await api(method,path,data);
    records=records.filter(record=>record.id!==saved.id);
    records.push(saved);
    $('dialog').close();
    render();
  } catch (error) { $('formNotice').textContent=error.message; }
  finally { busy=false; $('save').disabled=$('renew').disabled=$('close').disabled=false; }
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
  items:edit.items.map(item=>({...item,due:shift(item.due),actual:'',url:'',content:undefined}))},true);
form.onsubmit=event=>{
  event.preventDefault();
  if(activeUploads) return;
  const data=Object.fromEntries(fields.map(key=>[key,form.elements[key].value.trim()]));
  if(!data.name) { $('formNotice').textContent='Influencer adını gir.'; return; }
  if(data.end && data.end<data.start) { $('formNotice').textContent='Bitiş tarihi başlangıç tarihinden önce olamaz.'; return; }
  if (data.type==='Aylık') {
    for (const key of targetFields) {
      const value=form.elements[key].valueAsNumber;
      data[key]=Number.isNaN(value)?null:value;
    }
  }
  data.items=[...$('items').children].map(row=>({...Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value.trim()])),content:row.content}));
  data.id=edit?.id || form.dataset.newId || crypto.randomUUID();
  form.dataset.newId=data.id;
  mutate('PUT','/edit/api/records/'+data.id,data);
};
$('dialog').addEventListener('close',()=>{delete form.dataset.newId;});
$('dialog').addEventListener('cancel',event=>{if(busy||activeUploads)event.preventDefault();});
$('close').onclick=()=>{if(!activeUploads)$('dialog').close();};
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
const brandForm=$('brandForm');
let selectedLogo='', logoLoading=false;
function showLogo() {
  const preview=$('brandLogoPreview');
  preview.hidden=!selectedLogo;
  $('clearLogo').hidden=!selectedLogo;
  if(selectedLogo) preview.src=selectedLogo;
  else preview.removeAttribute('src');
}
async function resizeLogo(file) {
  if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>5*1024*1024) {
    throw Error('En fazla 5 MB boyutunda PNG, JPEG veya WebP seç.');
  }
  const bitmap=await createImageBitmap(file);
  try {
    const scale=Math.min(1,192/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const logo=canvas.toDataURL('image/webp',0.82);
    if(!logo.startsWith('data:image/webp;base64,') || logo.length>80000) throw Error('Bu görsel işlenemedi. Daha küçük bir görsel seç.');
    return logo;
  } finally {bitmap.close();}
}
brandForm.elements.brandLogo.onchange=async event=>{
  const [file]=event.target.files;
  if(!file || logoLoading) return;
  logoLoading=true;
  const controls=[$('saveBrand'),$('deleteBrand'),$('brandPicker'),$('closeBrand'),$('clearLogo'),event.target];
  controls.forEach(control=>control.disabled=true);
  $('brandNotice').textContent='';
  try {selectedLogo=await resizeLogo(file);showLogo();}
  catch(error) {event.target.value='';$('brandNotice').textContent=error.message;}
  finally {logoLoading=false;controls.forEach(control=>control.disabled=false);}
};
$('brandDialog').addEventListener('cancel',event=>{if(logoLoading)event.preventDefault();});
$('clearLogo').onclick=()=>{selectedLogo='';brandForm.elements.brandLogo.value='';showLogo();};
function openBrandManager() {
  $('brandPicker').replaceChildren(new Option('Yeni marka',''),...registeredBrands.map(entry=>new Option(brandName(entry),brandName(entry))));
  $('brandPicker').value=brandNames().includes(brand)?brand:'';
  syncBrandForm();
  $('brandDialog').showModal();
}
function syncBrandForm() {
  const selected=$('brandPicker').value;
  brandForm.elements.brandName.value=selected;
  brandForm.elements.brandLogo.value='';
  selectedLogo=registeredBrands.find(entry=>brandName(entry)===selected)?.logo||'';
  showLogo();
  $('deleteBrand').hidden=!selected;
  $('brandNotice').textContent='';
}
$('addBrand').onclick=openBrandManager;
$('brandPicker').onchange=syncBrandForm;
$('closeBrand').onclick=()=>$('brandDialog').close();
async function saveBrand(method) {
  const previous=$('brandPicker').value;
  const save=$('saveBrand'),remove=$('deleteBrand');
  if(save.disabled) return;
  save.disabled=remove.disabled=true;
  $('brandNotice').textContent='';
  try {
    const result=await api(method,'/edit/api/brands',{previous,name:brandForm.elements.brandName.value.trim(),logo:selectedLogo});
    brand=method==='DELETE'?'':result.name;
    status='';
    $('brandDialog').close();
    await load();
  } catch(error) {
    $('brandNotice').textContent=error.message;
  } finally {save.disabled=remove.disabled=false;}
}
brandForm.onsubmit=event=>{event.preventDefault();saveBrand($('brandPicker').value?'PUT':'POST');};
$('deleteBrand').onclick=()=>{if(confirm('Bu marka silinsin mi?')) saveBrand('DELETE');};
render();
load();
