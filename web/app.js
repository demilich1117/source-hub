import {imageLink,cssLink,formatSize} from './links.js';
const $=id=>document.getElementById(id);
const state={config:null,catalog:null,collection:'',tone:'dark',selected:null,files:[],busy:false};
const local=()=>state.config?.mode==='local';
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
let toastTimer;
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
async function read(url){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error('读取失败（'+response.status+'）');return response.json();}
async function refresh(){[state.config,state.catalog]=await Promise.all([read('./hub.json'),read('./catalog.json')]);render();}
async function load(){
  $('load-error').hidden=true;
  try{
    const [config,catalog]=await Promise.all([read('./hub.json'),read('./catalog.json')]);state.config=config;state.catalog=catalog;
    $('mode').textContent=local()?'本地管理':'公开素材库';$('mode').classList.toggle('local',local());
    $('upload-open').hidden=!local();$('archive-option').hidden=!local();
    const repository=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository)?config.repository:'';
    $('repo-link').href='https://github.com/'+repository;$('readme-link').href='https://github.com/'+repository+'#readme';
    $('subtitle').textContent=config.subtitle;
    $('publish-help').textContent=local()?'导入后，运行 npm test 和 npm run check，提交并推送到 main。GitHub Actions 会发布最新图集。':'新素材由仓库维护者发布。你可以复制地址，在自己的主题里引用图片。';
    $('link-mode').querySelector('[value="local"]').hidden=!local();
    render();
  }catch(error){$('load-error-text').textContent='暂时无法读取素材库：'+error.message;$('load-error').hidden=false;$('result-count').textContent='素材库未连接';}
}
function available(){return state.catalog.assets.filter(a=>!a.archived||(local()&&$('show-archived').checked));}
function render(){
  const all=available(),collections=[...new Set(all.map(a=>a.collection))].sort();
  if(state.collection&&!collections.includes(state.collection))state.collection='';
  $('collection-count').textContent=String(collections.length).padStart(2,'0');
  $('collections').replaceChildren();
  for(const [name,title] of [['','全部素材'],...collections.map(x=>[x,x])]){
    const button=el('button','collection-button');button.setAttribute('aria-current',String(state.collection===name));
    button.append(el('span','',title),el('span','',all.filter(a=>!name||a.collection===name).length));
    button.addEventListener('click',()=>{state.collection=name;$('version').value='';render();});$('collections').append(button);
  }
  $('collection-options').replaceChildren(...[...new Set(state.catalog.assets.map(a=>a.collection))].map(x=>{const o=el('option');o.value=x;return o;}));
  const versions=[...new Set(all.filter(a=>!state.collection||a.collection===state.collection).map(a=>a.version))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
  const selectedVersion=$('version').value;$('version').replaceChildren(new Option('所有版本',''),...versions.map(v=>new Option(v,v)));
  $('version').value=versions.includes(selectedVersion)?selectedVersion:'';
  $('library-title').replaceChildren(document.createTextNode(state.collection||'所有素材'),el('span','title-dot','.'));
  $('index-count').textContent=String(all.length).padStart(2,'0');
  const query=$('search').value.trim().toLowerCase();
  let assets=all.filter(a=>(!state.collection||a.collection===state.collection)&&(!$('version').value||a.version===$('version').value)&&(!$('type').value||a.ext===$('type').value)&&(!query||[a.name,a.collection,a.version,a.note,...a.tags].join(' ').toLowerCase().includes(query)));
  assets.sort((a,b)=>$('sort').value==='name'?a.name.localeCompare(b.name,'zh-CN'):$('sort').value==='size'?b.bytes-a.bytes:b.addedAt.localeCompare(a.addedAt));
  $('result-count').textContent=assets.length+' 张素材 · '+formatSize(assets.reduce((n,a)=>n+a.bytes,0));
  $('gallery').replaceChildren();$('empty').hidden=assets.length>0;
  $('empty-text').textContent=all.length?'没有匹配的素材，试试别的关键词或筛选条件。':local()?'导入第一张图片，开始整理你的图集。':'维护者还没有发布素材。';
  $('clear-filters').hidden=!all.length;
  assets.forEach((asset,index)=>{
    const card=el('article','asset-card'),preview=el('button','preview-button');preview.setAttribute('aria-label','查看 '+asset.name);
    const img=el('img');img.src='./'+asset.path;img.alt=asset.name;img.loading='lazy';img.decoding='async';img.width=asset.width;img.height=asset.height;
    img.addEventListener('error',()=>preview.append(el('span','image-error','图片暂时无法显示')));
    preview.append(img,el('span','preview-number',String(index+1).padStart(2,'0')),el('span','preview-kind',asset.ext.toUpperCase()));
    if(asset.archived)preview.append(el('span','archived-badge','已归档'));
    preview.addEventListener('click',()=>openDetail(asset.id));
    const caption=el('div','asset-caption'),info=el('div');info.append(el('h2','',asset.name),el('p','',asset.width+' × '+asset.height+' · '+formatSize(asset.bytes)+' · v'+asset.version));
    const copy=el('button','quick-copy','复制直链 ↗');copy.setAttribute('aria-label','复制 '+asset.name+' 的直链');
    copy.addEventListener('click',async()=>{try{const copied=await copyText(imageLink(asset,state.config));if(!copied){openDetail(asset.id);$('link-mode').value='raw';updateLink();$('link-value').focus();$('link-value').select();}else if(local()&&asset.committed===false)toast('已复制；新素材需提交并推送后生效。');}catch(error){toast(error.message);}});
    caption.append(info,copy);card.append(preview,caption);$('gallery').append(card);
  });
}
function setTone(tone){
  state.tone=tone;$('gallery').dataset.tone=tone;document.querySelector('.detail-preview').dataset.tone=tone;
  document.querySelectorAll('[data-tone].swatch').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tone===tone)));
  try{localStorage.setItem('source-hub-tone',tone);}catch{}
}
function current(){return state.catalog.assets.find(a=>a.id===state.selected);}
function openDetail(id){
  state.selected=id;const a=current();$('detail-image').src='./'+a.path;$('detail-image').alt=a.name;
  $('detail-title').textContent=a.name;$('detail-collection').textContent=a.collection+' / '+a.version;
  $('detail-dimensions').textContent=a.width+' × '+a.height+' PX';
  $('detail-meta').textContent=a.ext.toUpperCase()+' · '+formatSize(a.bytes)+(a.archived?' · 已归档':'');
  $('detail-note').textContent=a.note;$('detail-note').hidden=!a.note;
  $('detail-tags').replaceChildren(...a.tags.map(t=>el('span','',t)));
  $('edit-section').hidden=!local();$('edit-name').value=a.name;$('edit-tags').value=a.tags.join(', ');$('edit-note').value=a.note;
  $('archive-button').textContent=a.archived?'恢复到图集':'归档素材';$('edit-error').textContent='';
  $('asset-path').textContent=a.path;
  const pinned=$('link-mode').querySelector('[value="pinned"]');pinned.disabled=!state.config.commit||a.committed===false;
  if($('link-mode').selectedOptions[0].disabled)$('link-mode').value='raw';
  updateLink();if(!$('detail').open)$('detail').showModal();
}
function updateLink(){
  try{
    const mode=$('link-mode').value,a=current();$('link-value').value=imageLink(a,state.config,mode);
    $('link-hint').textContent=mode==='local'?'此链接仅本机可访问，用于酒馆实时预览。':mode==='pinned'?'锁定到当前提交，适合主题定版引用。':local()&&a.committed===false?'新素材还未提交。提交、推送并完成发布后，公开链接才会生效。':'文件名包含内容标识。替换素材会生成新地址，旧链接继续保留。';
    for(const id of ['copy-url','copy-css','copy-md'])$(id).disabled=false;
  }catch(error){$('link-value').value='';$('link-hint').textContent=error.message;for(const id of ['copy-url','copy-css','copy-md'])$(id).disabled=true;}
}
async function copyText(text){
  try{await navigator.clipboard.writeText(text);toast('已复制到剪贴板');return true;}
  catch{
    // Keep a selectable value visible when the browser denies clipboard access.
    $('link-value').value=text;$('link-value').focus();$('link-value').select();toast('浏览器未允许复制，请选中文本后手动复制。');return false;
  }
}
async function mutate(endpoint,body,json=false){
  const headers={'X-Hub-Token':state.config.token,'If-Match':String(state.catalog.revision)};if(json)headers['Content-Type']='application/json';
  const response=await fetch(endpoint,{method:'POST',headers,body:json?JSON.stringify(body):body});const data=await response.json();
  if(!response.ok){if(response.status===409)await refresh();throw new Error(data.error||'保存失败');}
  await refresh();return data;
}
function selectFiles(files){
  state.files=Array.from(files);$('selection-count').textContent=state.files.length?state.files.length+' 个文件 · '+formatSize(state.files.reduce((n,f)=>n+f.size,0)):'尚未选择文件';
  $('upload-submit').disabled=!state.files.length;$('upload-results').replaceChildren();$('upload-error').textContent='';
}
$('upload-open').addEventListener('click',()=>{
  if(!$('upload-collection').value)$('upload-collection').value=state.collection||'';
  if(!$('upload-version').value)$('upload-version').value=$('version').value;
  $('upload').showModal();
});
$('upload-files').addEventListener('change',e=>selectFiles(e.target.files));
$('drop-zone').addEventListener('dragover',e=>{e.preventDefault();if(!state.busy)$('drop-zone').classList.add('drag');});
$('drop-zone').addEventListener('dragleave',()=>$('drop-zone').classList.remove('drag'));
$('drop-zone').addEventListener('drop',e=>{e.preventDefault();$('drop-zone').classList.remove('drag');if(!state.busy)selectFiles(e.dataTransfer.files);});
$('upload-form').addEventListener('submit',async e=>{
  e.preventDefault();if(state.busy||!state.files.length)return;
  const collection=$('upload-collection').value.trim(),version=$('upload-version').value.trim();
  if(collection.includes('..')||version.includes('..')){$('upload-error').textContent='图集与版本不能包含连续的点。';return;}
  state.busy=true;$('upload-results').replaceChildren();$('upload-error').textContent='';
  for(const field of $('upload-form').querySelectorAll('input,button'))field.disabled=true;
  const failed=[];let successes=0;
  for(const file of state.files){
    const item=el('li','',file.name+' · 正在导入…');$('upload-results').append(item);
    try{
      if(file.size>32*1024*1024)throw new Error('超过 32 MiB，请先压缩或缩小尺寸');
      const result=await mutate('./api/assets?'+new URLSearchParams({name:file.name,collection,version}),file);
      item.className='success';item.textContent=file.name+(result.duplicate?' · 已存在，保留原链接':' · 已导入');successes++;
    }catch(error){failed.push(file);item.className='error';item.textContent=file.name+' · '+error.message;}
  }
  state.files=failed;state.busy=false;
  for(const field of $('upload-form').querySelectorAll('input,button'))field.disabled=false;
  $('upload-submit').disabled=!failed.length;$('upload-submit').textContent=failed.length?'重试失败文件':'导入素材';
  $('selection-count').textContent=successes+' 个已处理'+(failed.length?'，'+failed.length+' 个未成功':'。可以继续选择图片。');
  if(!failed.length)$('upload-files').value='';
  toast('导入完成：'+successes+' 个已处理'+(failed.length?'，'+failed.length+' 个失败':''));
});
$('edit-form').addEventListener('submit',async e=>{
  e.preventDefault();const id=state.selected;$('edit-save').disabled=true;$('edit-error').textContent='';
  try{await mutate('./api/assets/'+id,{name:$('edit-name').value,tags:$('edit-tags').value.split(/[,，]/).map(x=>x.trim()).filter(Boolean),note:$('edit-note').value},true);openDetail(id);toast('素材信息已保存');}catch(error){$('edit-error').textContent=error.message;}finally{$('edit-save').disabled=false;}
});
$('archive-button').addEventListener('click',async()=>{
  const a=current();$('archive-button').disabled=true;$('edit-error').textContent='';
  try{await mutate('./api/assets/'+a.id,{archived:!a.archived},true);openDetail(a.id);toast(a.archived?'已恢复到图集':'已归档。已有引用地址仍然有效。');}catch(error){$('edit-error').textContent=error.message;}finally{$('archive-button').disabled=false;}
});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.close==='upload'&&state.busy){toast('正在导入，请稍候');return;}$(button.dataset.close).close();}));
$('upload').addEventListener('cancel',e=>{if(state.busy)e.preventDefault();});
document.querySelectorAll('.swatch').forEach(b=>b.addEventListener('click',()=>setTone(b.dataset.tone)));
for(const id of ['version','type','sort','show-archived'])$(id).addEventListener('change',()=>state.catalog&&render());
$('search').addEventListener('input',()=>state.catalog&&render());
$('clear-filters').addEventListener('click',()=>{$('search').value='';$('type').value='';$('version').value='';state.collection='';render();});
$('reload').addEventListener('click',load);$('link-mode').addEventListener('change',updateLink);
$('copy-url').addEventListener('click',()=>copyText($('link-value').value));
$('copy-css').addEventListener('click',()=>copyText(cssLink($('link-value').value)));
$('copy-md').addEventListener('click',()=>copyText('!['+current().name.replace(/[\\\[\]]/g,'\\$&')+'](<'+$('link-value').value+'>)'));
try{const tone=localStorage.getItem('source-hub-tone');if(['dark','light','checker'].includes(tone))setTone(tone);}catch{}
await load();
