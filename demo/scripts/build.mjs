import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
const read = path => readFile(path,'utf8');
const [page,client,editor,editorClient,accessClient,loginPage,server]=await Promise.all(['worker/page.html','worker/app.js','worker/editor.html','worker/editor.js','worker/access.js','worker/login.html','worker/server.mjs'].map(read));
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js','const PAGE='+JSON.stringify(page)+';\nconst CLIENT='+JSON.stringify(client)+';\n'+'const EDITOR='+JSON.stringify(editor)+';\nconst EDITOR_CLIENT='+JSON.stringify(editorClient)+';\n'+'const ACCESS_CLIENT='+JSON.stringify(accessClient)+';\n'+'const LOGIN_PAGE='+JSON.stringify(loginPage)+';\n'+server);
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
