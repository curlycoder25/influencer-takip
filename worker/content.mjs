const partSize=8*1024*1024;
const maxSize=1024**3;
const contentRoute=/^\/(edit\/)?api\/content(?:\/([a-f0-9-]{36}))?$/;
async function contentRequest(request,env,url,route) {
  const bucket=env.BUCKET;
  if(!bucket) return json({error:'Dosya depolaması kullanılamıyor.'},503);
  const [,edit,id]=route;
  const method=request.method;
  if(id && method==='GET') {
    const object=await bucket.get(id);
    if(!object) return json({error:'Dosya bulunamadı.'},404);
    const name=object.customMetadata?.name||'icerik';
    return new Response(object.body,{headers:{...headers,'Content-Type':'application/octet-stream',
      'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(name).replace(/'/g,'%27'),
      'Content-Length':String(object.size)}});
  }
  if(!id && method==='POST') {
    const {name,size}=await request.json();
    if(typeof name!=='string'||!name.trim()||name.length>255||!Number.isSafeInteger(size)||size<1||size>maxSize) {
      return json({error:'En fazla 1 GB boyutunda bir dosya seç.'},400);
    }
    const key=crypto.randomUUID();
    const upload=await bucket.createMultipartUpload(key,{customMetadata:{name}});
    return json({id:key,uploadId:upload.uploadId,partSize});
  }
  const uploadId=url.searchParams.get('uploadId');
  if(!id||!uploadId) return json({error:'Geçersiz yükleme'},400);
  const upload=bucket.resumeMultipartUpload(id,uploadId);
  if(method==='PUT') {
    const part=Number(url.searchParams.get('part'));
    const length=Number(request.headers.get('Content-Length'));
    if(!Number.isInteger(part)||part<1||part>128||length<1||length>partSize) return json({error:'Geçersiz dosya parçası'},400);
    const bytes=await request.arrayBuffer();
    if(bytes.byteLength!==length) return json({error:'Eksik dosya parçası'},400);
    return json(await upload.uploadPart(part,bytes));
  }
  if(method==='POST') {
    const parts=await request.json();
    if(!Array.isArray(parts)||!parts.length||parts.length>128||
      !parts.every((part,index)=>part?.partNumber===index+1&&typeof part.etag==='string')) {
      return json({error:'Geçersiz dosya parçaları'},400);
    }
    await upload.complete(parts);
    return json({id});
  }
  if(method==='DELETE') {
    await upload.abort();
    return json({aborted:true});
  }
  return json({error:'İşleme izin verilmiyor'},405);
}
