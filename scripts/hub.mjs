import {readFile} from 'node:fs/promises';import path from 'node:path';
const [command,...args]=process.argv.slice(2);
if(!command||command==='help'){console.log('Source Hub\n  list\n  add <image> <collection> <version>\n  edit <id> <metadata.json>\nUses HUB_URL or .local/runtime.json. Run npm start first.');process.exit(0);}
try{
 const address=process.env.HUB_URL||JSON.parse(await readFile(new URL('../.local/runtime.json',import.meta.url),'utf8')).address;
 const config=await (await fetch(address+'/hub.json')).json();if(config.mode!=='local'||!config.token)throw new Error('目标不是本地管理服务。');
 const catalog=await(await fetch(address+'/catalog.json')).json();
 if(command==='list'){console.log(JSON.stringify(catalog,null,2));process.exit(0);}
 let endpoint,body,headers={'X-Hub-Token':config.token,'If-Match':String(catalog.revision)};
 if(command==='add'){endpoint='/api/assets?'+new URLSearchParams({name:path.basename(args[0]),collection:args[1],version:args[2]});body=await readFile(args[0]);}
 else if(command==='edit'){endpoint='/api/assets/'+encodeURIComponent(args[0]);body=await readFile(args[1]);headers['Content-Type']='application/json';}
 else throw new Error('Unknown command');
 const response=await fetch(address+endpoint,{method:'POST',headers,body}),data=await response.json();if(!response.ok)throw new Error(data.error);console.log(JSON.stringify({revision:data.catalog.revision,asset:data.asset,duplicate:data.duplicate},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
