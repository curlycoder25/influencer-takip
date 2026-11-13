import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
const read = path => readFile(path,'utf8');
const [page,client,content,server]=await Promise.all(['worker/page.html','worker/app.js','worker/content.mjs','worker/server.mjs'].map(read));
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js','const PAGE='+JSON.stringify(page)+';\nconst CLIENT='+JSON.stringify(client)+';\n'+content+server);
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
await copyFile('worker/wrangler.json','dist/server/wrangler.json');
