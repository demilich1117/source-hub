import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,copyFile,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {inspectImage,MAX_BYTES} from '../lib/images.mjs';
import {openStore,verifyCatalog,safeFile,segment,hash} from '../lib/store.mjs';
import {startServer} from '../server.mjs';
import {build} from '../scripts/build.mjs';
import {imageLink,cssLink} from '../web/links.js';
const repo=path.resolve(import.meta.dirname,'..');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE1sAAAAASUVORK5CYII=','base64');
const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
const input={name:'silver-frame.png',collection:'moonveil',version:'2.2.4'};
const config={repository:'demilich1117/source-hub',branch:'main',pagesUrl:'https://demilich1117.github.io/source-hub/'};
async function fixture(t){
  const base=path.resolve(os.tmpdir()),root=await mkdtemp(path.join(base,'source-hub-test-'));
  t.after(async()=>{if(path.dirname(path.resolve(root))!==base||!path.basename(root).startsWith('source-hub-test-'))throw new Error('Unsafe cleanup');await rm(root,{recursive:true,force:true});});
  await writeFile(path.join(root,'catalog.json'),JSON.stringify({schemaVersion:1,revision:0,assets:[]}));
  await writeFile(path.join(root,'hub.config.json'),JSON.stringify(config));
  await mkdir(path.join(root,'web'));
  for(const file of ['index.html','app.js','links.js','style.css','favicon.svg'])await copyFile(path.join(repo,'web',file),path.join(root,'web',file));
  return root;
}
test('reads actual raster dimensions and rejects oversized, unknown or truncated data',()=>{
  assert.deepEqual(inspectImage(png),{ext:'png',mime:'image/png',width:1,height:1,animated:false});
  assert.equal(inspectImage(gif).width,1);
  for(const bytes of [Buffer.alloc(0),Buffer.from('<svg></svg>'),png.subarray(0,20),png.subarray(0,33),gif.subarray(0,-1),Buffer.alloc(MAX_BYTES+1)])assert.throws(()=>inspectImage(bytes));
  const huge=Buffer.from(png);huge.writeUInt32BE(50000,16);huge.writeUInt32BE(50000,20);assert.throws(()=>inspectImage(huge),/像素/);
});
test('all shipped WebP files agree with catalogue dimensions and hashes',async()=>{
  const catalog=JSON.parse(await readFile(path.join(repo,'catalog.json'),'utf8'));
  assert.ok(catalog.assets.length>=12);
  const totals=await verifyCatalog(repo,catalog);assert.ok(totals.bytes>0);
});
test('safe path segments reject traversal and Windows device names',()=>{
  for(const s of ['../x','a/b','x\\y','x..y','NUL','con','aux.txt','','a '.repeat(40)])assert.throws(()=>segment(s,true));
  assert.equal(segment('moonveil-covenant'),'moonveil-covenant');assert.equal(segment('2.2.4',true),'2.2.4');
});
test('imports preserve original bytes, deduplicate by content within a version and persist',async t=>{
  const root=await fixture(t),store=await openStore(root),first=await store.add(png,input,0);
  assert.deepEqual(await readFile(path.join(root,first.asset.path)),png);assert.match(first.asset.path,/-[a-f0-9]{16}\.png$/);
  const duplicate=await store.add(png,{...input,name:'renamed.png'},1);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.catalog.revision,1);
  const second=await store.add(png,{...input,version:'2.2.5'},1);assert.notEqual(second.asset.path,first.asset.path);
  assert.equal((await openStore(root)).snapshot().assets.length,2);
});
test('same filename with new content gets a new path and retains old bytes',async t=>{
  const root=await fixture(t),store=await openStore(root);const a=await store.add(png,input,0),b=await store.add(gif,input,1);
  assert.notEqual(a.asset.path,b.asset.path);assert.equal(b.asset.ext,'gif');assert.deepEqual(await readFile(path.join(root,a.asset.path)),png);
});
test('invalid metadata cannot create an orphan image',async t=>{
  const root=await fixture(t),store=await openStore(root);
  await assert.rejects(()=>store.add(png,{...input,title:'x'.repeat(121)},0));assert.equal(store.snapshot().revision,0);
  assert.equal((await readdir(root)).includes('assets'),false);
});
test('concurrent mutations use revision conflicts instead of dropping changes',async t=>{
  const store=await openStore(await fixture(t));const results=await Promise.allSettled([store.add(png,input,0),store.add(gif,input,0)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.status,409);
  assert.equal(store.snapshot().assets.length,1);
});
test('editing and reversible archiving cannot change the image path',async t=>{
  const root=await fixture(t),store=await openStore(root),a=(await store.add(png,input,0)).asset;
  const b=await store.update(a.id,{name:'新名称',tags:['银色','银色'],note:'用于边框',path:'outside',archived:true},1);
  assert.equal(b.asset.path,a.path);assert.deepEqual(b.asset.tags,['银色']);assert.equal(b.asset.archived,true);
  await store.update(a.id,{archived:false},2);assert.equal(store.snapshot().assets[0].archived,false);
  await verifyCatalog(root,store.snapshot());
});
test('catalogue verification detects byte changes and unsafe paths',async t=>{
  const root=await fixture(t),store=await openStore(root),a=(await store.add(png,input,0)).asset;
  await assert.rejects(()=>safeFile(root,'assets/../hub.config.json'));
  await writeFile(path.join(root,a.path),gif);await assert.rejects(()=>verifyCatalog(root,store.snapshot()),/校验/);
});
test('symbolic directory paths cannot escape the repository',async t=>{
  const root=await fixture(t);await mkdir(path.join(root,'elsewhere'));
  await symlink(path.join(root,'elsewhere'),path.join(root,'assets'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(()=>safeFile(root,'assets/moonveil/1.0/image-0123456789abcdef.png',false),/符号链接/);
});
test('local API checks origin, token and revision; only assets are cross-origin readable',async t=>{
  const root=await fixture(t),app=await startServer({root,port:0});t.after(()=>app.close());
  const hub=await(await fetch(app.address+'/hub.json')).json();assert.equal(hub.mode,'local');assert.ok(hub.token);
  assert.equal((await fetch(app.address+'/hub.json',{headers:{Origin:'https://other.test'}})).status,403);
  const hostStatus=await new Promise((resolve,reject)=>http.get(app.address+'/hub.json',{headers:{Host:'other.test'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));assert.equal(hostStatus,403);
  const endpoint=app.address+'/api/assets?'+new URLSearchParams(input);
  assert.equal((await fetch(endpoint,{method:'POST',body:png})).status,403);
  const headers={'X-Hub-Token':hub.token,'If-Match':'0'};
  const response=await fetch(endpoint,{method:'POST',body:png,headers});assert.equal(response.status,201);
  const {asset}=await response.json();
  assert.equal((await fetch(endpoint,{method:'POST',body:gif,headers})).status,409);
  const image=await fetch(app.address+'/'+asset.path,{headers:{Origin:'https://other.test'}});
  assert.equal(image.status,200);assert.equal(image.headers.get('access-control-allow-origin'),'*');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
  assert.equal((await fetch(app.address+'/.local/runtime.json')).status,404);
  assert.equal((await fetch(app.address+'/server.mjs')).status,404);
  const page=await fetch(app.address+'/');assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
});
test('a second local server cannot overwrite a live catalogue',async t=>{
  const root=await fixture(t),app=await startServer({root,port:0});t.after(()=>app.close());
  await assert.rejects(()=>startServer({root,port:0}),/已有/);
});
test('public build hides archived entries and local data while retaining archived image URLs',async t=>{
  const root=await fixture(t),store=await openStore(root),a=(await store.add(png,input,0)).asset;
  await store.add(gif,input,1);await store.update(a.id,{archived:true},2);
  await mkdir(path.join(root,'.local'));await writeFile(path.join(root,'.local','secret'),'do not publish');
  const result=await build(root);assert.equal(result.count,2);
  const catalog=JSON.parse(await readFile(path.join(result.out,'catalog.json'),'utf8'));assert.equal(catalog.assets.length,1);assert.equal(catalog.assets[0].committed,false);
  assert.deepEqual(await readFile(path.join(result.out,a.path)),png);
  const hub=JSON.parse(await readFile(path.join(result.out,'hub.json'),'utf8'));assert.equal(hub.mode,'public');assert.equal(hub.token,undefined);
  const names=await readdir(result.out);assert.ok(!names.includes('.local'));assert.ok(!names.includes('server.mjs'));
  await build(root);
});
test('build refuses to delete an unrelated site directory',async t=>{
  const root=await fixture(t);await mkdir(path.join(root,'site'));await writeFile(path.join(root,'site','keep.txt'),'keep');
  await assert.rejects(()=>build(root),/拒绝覆盖/);assert.equal(await readFile(path.join(root,'site','keep.txt'),'utf8'),'keep');
});
test('links use repository subpaths and require a committed asset for pinned URLs',()=>{
  const a={path:'assets/moonveil/2.2.4/image-0123456789abcdef.png'},c={...config,commit:'a'.repeat(40),localBase:'http://127.0.0.1:19325/'};
  assert.equal(imageLink(a,c,'pages'),config.pagesUrl+a.path);
  assert.equal(imageLink(a,c,'raw'),'https://raw.githubusercontent.com/demilich1117/source-hub/main/'+a.path);
  assert.ok(imageLink(a,c,'pinned').includes('/'+'a'.repeat(40)+'/'));
  assert.throws(()=>imageLink({...a,committed:false},c,'pinned'));
  assert.throws(()=>imageLink(a,{...c,commit:''},'pinned'));
  assert.equal(cssLink(imageLink(a,c,'local')),'url("http://127.0.0.1:19325/'+a.path+'")');
});
