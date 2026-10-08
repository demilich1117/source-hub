import {readFile,writeFile,mkdir,rename,lstat} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import path from 'node:path';
import {inspectImage} from './images.mjs';
export const ASSET_PATH = /^assets\/[a-z0-9][a-z0-9_-]{0,59}\/[a-z0-9][a-z0-9._-]{0,39}\/[a-z0-9][a-z0-9_-]{0,59}-[a-f0-9]{16}\.(png|jpg|webp|gif)$/;
export const hash = b => createHash('sha256').update(b).digest('hex');
export function segment(value, version=false) {
  if(typeof value!=='string' || !(version ? /^[a-z0-9][a-z0-9._-]{0,39}$/ : /^[a-z0-9][a-z0-9_-]{0,59}$/).test(value) || value.includes('..') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) throw new Error('分类和版本只允许小写字母、数字、短横线；版本还可用点，不能包含路径。');
  return value;
}
function text(v,max,required=false) { if(typeof v!=='string'||v.length>max||(required&&!v.trim())) throw new Error(`文字需${required?'为 1–':'不超过 '}${max}字。`);return v.trim(); }
export async function safeFile(root, relative, mustExist=true) {
  if(!ASSET_PATH.test(relative)) throw new Error('素材路径无效。');
  const absolute=path.resolve(root,...relative.split('/'));
  if(!absolute.startsWith(path.resolve(root)+path.sep)) throw new Error('素材越出仓库。');
  let cursor=path.resolve(root);
  for(const part of relative.split('/')) { cursor=path.join(cursor,part);try {if((await lstat(cursor)).isSymbolicLink()) throw new Error('素材路径不允许符号链接。');} catch(e) {if(e.code==='ENOENT'&&!mustExist) break; throw e;} }
  return absolute;
}
export async function openStore(root) {
  root=path.resolve(root); const file=path.join(root,'catalog.json');
  let catalog=JSON.parse(await readFile(file,'utf8')); let queue=Promise.resolve();
  if(catalog.schemaVersion!==1||!Array.isArray(catalog.assets)||!Number.isInteger(catalog.revision)) throw new Error('素材索引格式无效。');
  const transaction=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
  async function save(next) {const tmp=file+'.'+randomBytes(6).toString('hex')+'.tmp';await writeFile(tmp,JSON.stringify(next,null,2)+'\n');await rename(tmp,file);catalog=next;}
  function check(revision) {if(revision!==catalog.revision) throw Object.assign(new Error('素材库已更新，请刷新后重试。'),{status:409});}
  return {
    snapshot:()=>structuredClone(catalog),
    add:(bytes,input,revision)=>transaction(async()=>{
      check(revision); const info=inspectImage(bytes), collection=segment(input.collection), version=segment(input.version,true);
      const sha=hash(bytes), existing=catalog.assets.find(a=>a.hash===sha&&a.collection===collection&&a.version===version);
      if(existing) return {catalog:structuredClone(catalog),asset:existing,duplicate:true};
      const stem=String(input.name||'image').replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'image';
      const name=text(String(input.title||input.name||stem),120,true);
      const relative=`assets/${collection}/${version}/${stem}-${sha.slice(0,16)}.${info.ext}`;
      const dest=await safeFile(root,relative,false);await mkdir(path.dirname(dest),{recursive:true});
      try {await writeFile(dest,bytes,{flag:'wx'});} catch(e) {if(e.code!=='EEXIST') throw e; if(hash(await readFile(dest))!==sha) throw new Error('文件名冲突，原文件已保留。');}
      const asset={id:hash(relative),path:relative,name,collection,version,hash:sha,bytes:bytes.length,...info,tags:[],note:'',archived:false,addedAt:new Date().toISOString()};
      await save({...catalog,revision:catalog.revision+1,assets:[...catalog.assets,asset]});return {catalog:structuredClone(catalog),asset,duplicate:false};
    }),
    update:(id,input,revision)=>transaction(async()=>{
      check(revision); const old=catalog.assets.find(a=>a.id===id);if(!old) throw Object.assign(new Error('素材不存在。'),{status:404});
      const next={...old};if(input.name!==undefined) next.name=text(input.name,120,true);if(input.note!==undefined) next.note=text(input.note,1000);
      if(input.tags!==undefined) {if(!Array.isArray(input.tags)||input.tags.length>12) throw new Error('最多 12 个标签。');next.tags=[...new Set(input.tags.map(x=>text(x,30,true)))];}
      if(input.archived!==undefined) {if(typeof input.archived!=='boolean') throw new Error('归档状态无效。');next.archived=input.archived;}
      await save({...catalog,revision:catalog.revision+1,assets:catalog.assets.map(a=>a.id===id?next:a)});return {catalog:structuredClone(catalog),asset:next};
    })
  };
}
export async function verifyCatalog(root,catalog) {
  if(catalog.schemaVersion!==1||!Array.isArray(catalog.assets)||!Number.isInteger(catalog.revision)||catalog.revision<0)throw new Error('素材索引格式无效。');
  const seen=new Set();let total=0;
  for(const a of catalog.assets) {
    if(seen.has(a.id)||hash(a.path)!==a.id) throw new Error('素材 ID 重复或无效。');seen.add(a.id);text(a.name,120,true);text(a.note,1000);if(!Array.isArray(a.tags)||a.tags.length>12||typeof a.archived!=='boolean')throw new Error('素材信息无效。');a.tags.forEach(t=>text(t,30,true));
    if(!a.path.startsWith(`assets/${segment(a.collection)}/${segment(a.version,true)}/`)) throw new Error('素材分类路径不一致。');
    const b=await readFile(await safeFile(root,a.path)); const info=inspectImage(b);
    if(hash(b)!==a.hash||b.length!==a.bytes||info.ext!==a.ext||info.mime!==a.mime||info.width!==a.width||info.height!==a.height||!a.path.endsWith(`-${a.hash.slice(0,16)}.${a.ext}`)) throw new Error(`素材校验失败：${a.path}`);
    total+=b.length;
  }
  if(total>900*1024*1024) throw new Error('素材接近 Pages 站点容量，请拆分仓库。');
  return {count:seen.size,bytes:total};
}
