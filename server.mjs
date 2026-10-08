import http from 'node:http';
import path from 'node:path';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {gitState} from './lib/git.mjs';
import {pathToFileURL} from 'node:url';
import {openStore,safeFile,ASSET_PATH} from './lib/store.mjs';
import {MAX_BYTES} from './lib/images.mjs';
export async function startServer({root=import.meta.dirname,port=19325}={}) {
  root=path.resolve(root);await mkdir(path.join(root,'.local'),{recursive:true});
  const lock=path.join(root,'.local/server.lock');
  try {await writeFile(lock,String(process.pid),{flag:'wx'});} catch(e) {
    if(e.code!=='EEXIST') throw e; const pid=Number(await readFile(lock,'utf8'));let alive=true;
    if(Number.isInteger(pid)&&pid>0) {try{process.kill(pid,0);}catch(err){if(err.code==='ESRCH') alive=false;}} else throw new Error('服务锁格式无效，请检查 .local/server.lock。');
    if(alive) throw new Error('这个仓库已有本地管理服务运行。');await unlink(lock);await writeFile(lock,String(process.pid),{flag:'wx'});
  }
  let server; const release=async()=>{try{if(await readFile(lock,'utf8')===String(process.pid)) await unlink(lock);}catch(e){if(e.code!=='ENOENT') throw e;}};
  try {
    const store=await openStore(root),config=JSON.parse(await readFile(path.join(root,'hub.config.json'),'utf8')),token=randomBytes(32).toString('hex');
    const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    async function body(req,max) {const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>max) throw Object.assign(new Error('请求超过大小上限。'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);}
    server=http.createServer(async(req,res)=>{
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
      try {
        const hosts=new Set([`127.0.0.1:${server.address().port}`,`localhost:${server.address().port}`]);if(!hosts.has(req.headers.host)) return json(res,403,{error:'Host rejected'});
        const origin=`http://${req.headers.host}`,url=new URL(req.url,origin),relative=decodeURIComponent(url.pathname.slice(1));
        const image=req.method==='GET'&&ASSET_PATH.test(relative);
        if(!image&&((req.headers.origin&&req.headers.origin!==origin)||req.headers['sec-fetch-site']==='cross-site')) return json(res,403,{error:'Origin rejected'});
        if(req.method==='POST') {const supplied=Buffer.from(String(req.headers['x-hub-token']||''));if(supplied.length!==token.length||!timingSafeEqual(supplied,Buffer.from(token))) return json(res,403,{error:'Token rejected'});}
        if(req.method==='GET'&&relative==='hub.json') return json(res,200,{...config,mode:'local',token,commit:gitState(root).commit,localBase:origin+'/'});
        if(req.method==='GET'&&relative==='catalog.json') {const catalog=store.snapshot(),{committed}=gitState(root);catalog.assets=catalog.assets.map(a=>({...a,committed:committed.has(a.path)}));return json(res,200,catalog);}
        if(req.method==='POST'&&relative==='api/assets') {
          const input=Object.fromEntries(['name','collection','version'].map(k=>[k,url.searchParams.get(k)]));
          return json(res,201,await store.add(await body(req,MAX_BYTES),input,Number(req.headers['if-match'])));
        }
        if(req.method==='POST'&&/^api\/assets\/[a-f0-9]{64}$/.test(relative)) {
          if(!String(req.headers['content-type']).startsWith('application/json')) return json(res,415,{error:'JSON required'});
          return json(res,200,await store.update(relative.split('/').at(-1),JSON.parse((await body(req,16384)).toString('utf8')),Number(req.headers['if-match'])));
        }
        if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});
        if(image) {
          const content=await readFile(await safeFile(root,relative));const ext=path.extname(relative).slice(1);
          res.writeHead(200,{'Content-Type':{png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif'}[ext],'Cache-Control':'public,max-age=31536000,immutable','Access-Control-Allow-Origin':'*'});return res.end(content);
        }
        const allowed={'':'index.html','index.html':'index.html','app.js':'app.js','links.js':'links.js','style.css':'style.css','favicon.svg':'favicon.svg'};
        if(!Object.hasOwn(allowed,relative)) return json(res,404,{error:'Not found'});
        const file=path.join(root,'web',allowed[relative]),ext=path.extname(file);
        res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[ext],'Content-Security-Policy':"default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(await readFile(file));
      }catch(e){if(!res.headersSent)json(res,e.status||(e.code==='ENOENT'?404:400),{error:e.message});else res.end();}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    const address=`http://127.0.0.1:${server.address().port}`;await writeFile(path.join(root,'.local/runtime.json'),JSON.stringify({address,pid:process.pid}));
    return {address,store,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await release();}};
  }catch(e){await release();throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const app=await startServer({port:Number(process.env.PORT||19325)});console.log(`Source Hub: ${app.address}`);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});}
