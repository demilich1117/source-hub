import {execFileSync} from 'node:child_process';
export function gitState(root) {
  const run=(...args)=>execFileSync('git',['-c',`safe.directory=${root}`,...args],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore'],windowsHide:true}).trim();
  try {return {commit:run('rev-parse','HEAD'),committed:new Set(run('ls-tree','-r','--name-only','HEAD','assets').split('\n'))};}catch{return {commit:'',committed:new Set()};}
}
