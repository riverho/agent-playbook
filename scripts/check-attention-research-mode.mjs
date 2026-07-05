#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
const root = process.cwd();
const checks=[];
function check(name, fn){checks.push({name,fn});}
function y(rel){return yaml.load(readFileSync(resolve(root,rel),'utf8'))||{};}
check('attention-research registered in playbook and catalog',()=>{
  const master=y('playbook.yaml');
  if(master.modes?.['attention-research']!=='modes/attention-research.yaml') throw new Error('missing in playbook.yaml');
  const idx=y('modes/index.yaml');
  if(!(idx.modes||[]).some(m=>m.id==='attention-research')) throw new Error('missing in modes/index.yaml');
});
check('mode file and pack indexes are well formed',()=>{
  const doc=y('modes/attention-research.yaml');
  if(doc.id!=='attention-research') throw new Error('bad id');
  for(const k of ['skills_index','processes_index']) if(!existsSync(resolve(root,doc[k]))) throw new Error(`${k} missing`);
  for(const k of ['items','skill','id_field','goal_template','check_field','config']) if(!doc.scaffold?.[k]) throw new Error(`scaffold missing ${k}`);
});
check('skill/process files exist and link',()=>{
  const doc=y('modes/attention-research.yaml');
  const skills=y(doc.skills_index).skills||[];
  const processes=y(doc.processes_index).processes||[];
  const pids=new Set(processes.map(p=>p.id));
  for(const s of skills){ if(!existsSync(resolve(root,s.file))) throw new Error(`skill missing ${s.file}`); if(!pids.has(s.process)) throw new Error(`skill ${s.id} bad process ${s.process}`); }
  for(const p of processes){ if(!existsSync(resolve(root,p.file))) throw new Error(`process missing ${p.file}`); }
});
check('attention-research project scaffolds exist',()=>{
  const base='/Users/river/.openclaw/workspace/projects/attention-research';
  for(const rel of ['project.yaml','scaffolds/index.yaml','scaffolds/cron/ar-morning-digest.yaml','scaffolds/cron/ar-afternoon-update.yaml','scaffolds/modes/attention-research/morning-run.yaml','scaffolds/modes/attention-research/afternoon-run.yaml']){
    if(!existsSync(resolve(base,rel))) throw new Error(`missing ${base}/${rel}`);
  }
});
check('pack is carry-on',()=>{
  function walk(dir){ if(!existsSync(resolve(root,dir))) return; for(const ent of readdirSync(resolve(root,dir),{withFileTypes:true})){ if(ent.name==='node_modules'||ent.name==='package.json') throw new Error(`carry-on violation ${dir}/${ent.name}`); if(ent.isDirectory()) walk(`${dir}/${ent.name}`); }}
  walk('modes/attention-research');
});
let pass=0,fail=0; for(const {name,fn} of checks){try{fn();console.log(`  PASS  ${name}`);pass++;}catch(e){console.error(`  FAIL  ${name}\n        ${e.message}`);fail++;}}
console.log(`\ncheck-attention-research-mode: ${pass} pass, ${fail} fail`); if(fail) process.exit(1);
