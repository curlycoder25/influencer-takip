const $ = id => document.getElementById(id);
const brandColors = new Map([['FastDrama','#d65075'],['Yemek Market','#eb654c'],['Amore','#9564e2']]);
let registeredBrands = [...brandColors.keys()];
const brandName = entry => typeof entry==='string'?entry:entry.name;
const brandNames = () => [...new Set([...registeredBrands.map(brandName),...records.map(record=>record.brand)])];
const paymentLabels = {pending:'Ödeme bekliyor',half:'İlk yarı ödendi',paid:'Tamamı ödendi'};
function targetSummary(record) {
  if (record.type !== 'Aylık') return '';
  const targets = [];
  if (record.weeklyStories != null) targets.push('Haftada ' + record.weeklyStories + ' Story');
  if (record.monthlyStories != null) targets.push('Ayda ' + record.monthlyStories + ' Story');
  if (record.monthlyReels != null) targets.push('Ayda ' + record.monthlyReels + ' Reels');
  return targets.length ? '<small>Hedef · ' + targets.join(' · ') + '</small>' : '';
}
let records = [], brand = '', status = '', openId = null, ready = false, loading = false;
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
      '<div class="empty"><h3>Henüz iş birliği yok</h3></div>';
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
      '</td><td><span class="chip '+(record.paymentStatus==='paid'?'ok':'')+'">'+paymentLabels[record.paymentStatus]+'</span></td><td><button data-record="'+escape(record.id)+'">Detaylar</button></td></tr>';
    }).join('')+'</tbody></table>';
}
function link(value) {
  return safeUrl(value) ? '<a href="'+safeUrl(value)+'" target="_blank" rel="noopener noreferrer">Bağlantıyı aç ↗</a>' : '—';
}
function showDetails(record) {
  openId=record.id;
  $('dialogTitle').textContent=record.name;
  const values=[
    ['Instagram hesabı',escape(record.handle)],['Marka',escape(record.brand)],['İş birliği türü',escape(record.type)],
    ['Tarih',stamp(record.start)+(record.end?' – '+stamp(record.end):'')],['Ödeme durumu',escape(paymentLabels[record.paymentStatus])],
    ['Ödeme / komisyon koşulu',escape(record.payment)],['Özel takip bağlantısı',link(record.tracking)],
    ['Haftalık Story hedefi',escape(record.weeklyStories)],['Aylık Story hedefi',escape(record.monthlyStories)],['Aylık Reels hedefi',escape(record.monthlyReels)],['Not',escape(record.notes)]
  ];
  const info=values.map(([label,value])=>'<div'+(label==='Not'?' class="full"':'')+'><dt>'+label+'</dt><dd>'+(value||'—')+'</dd></div>').join('');
  const posts=record.items.map(item=>'<tr><td>'+escape(item.kind)+'</td><td>'+stamp(item.due)+'</td><td>'+stamp(item.actual)+'</td><td>'+link(item.url)+'</td><td>'+(item.content && /^[a-f0-9-]{36}$/.test(item.content.id)?'<a href="/api/content/'+item.content.id+'">'+escape(item.content.name)+'</a>':'—')+'</td></tr>').join('');
  $('details').innerHTML='<dl class="grid details">'+info+'</dl><h2>Paylaşım planı</h2>'+
    (posts?'<div class="scroll detailPosts"><table class="table"><thead><tr><th>Format</th><th>Planlanan tarih</th><th>Paylaşım tarihi</th><th>Bağlantı</th><th>İçerik</th></tr></thead><tbody>'+posts+'</tbody></table></div>':'<p>Henüz paylaşım eklenmedi.</p>');
  if (!$('dialog').open) $('dialog').showModal();
}
async function load() {
  if (loading) return;
  loading=true;
  try {
    const responses=await Promise.all(['/api/records','/api/brands'].map(path=>fetch(path,{cache:'no-store'})));
    if (responses.some(response=>!response.ok)) throw new Error();
    const [updated,updatedBrands]=await Promise.all(responses.map(response=>response.json()));
    if (ready && JSON.stringify(updated)===JSON.stringify(records) && JSON.stringify(updatedBrands)===JSON.stringify(registeredBrands)) {
      $('notice').textContent='';
      return;
    }
    records=updated;
    registeredBrands=updatedBrands;
    ready=true;
    $('notice').textContent='';
    render();
    if (openId) {
      const record=records.find(entry=>entry.id===openId);
      if (record) showDetails(record);
      else $('dialog').close();
    }
  } catch {
    $('notice').textContent=ready?'Son kayıtlar alınamadı. Ekrandaki bilgiler güncel olmayabilir.':'Kayıtlar yüklenemedi. Yenile düğmesiyle tekrar dene.';
    if (!ready) $('list').innerHTML='<div class="empty"><button data-retry>Yeniden yükle</button></div>';
  } finally {loading=false;}
}
$('dialog').addEventListener('close',()=>{openId=null;});
$('close').onclick=()=>$('dialog').close();
$('refresh').onclick=load;
$('brands').onclick=event=>{const button=event.target.closest('[data-brand]');if(button){brand=button.dataset.brand;status='';render();}};
$('metrics').onclick=event=>{const button=event.target.closest('[data-status]');if(button){status=button.dataset.status;render();}};
$('list').onclick=event=>{
  const button=event.target.closest('button');
  if(!button) return;
  if(button.hasAttribute('data-retry')) load();
  if(button.hasAttribute('data-reset')) {brand=status=$('filter').value=$('search').value=$('month').value='';render();}
  if(button.dataset.record) showDetails(records.find(record=>record.id===button.dataset.record));
};
$('search').oninput=render;
$('filter').onchange=$('month').onchange=render;
render();
load();
setInterval(load,30000);
