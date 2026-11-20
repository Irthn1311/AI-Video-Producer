import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {assertConfig,readJson,writeJson,sha,getProject} from '../src/utils.mjs';
import {loadState,saveState,sceneState,staleParts,recordArtifact,approve,gate} from '../src/state.mjs';
import {inspect} from '../src/inspect.mjs';
const template=readJson(new URL('../templates/project.json',import.meta.url));
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'avp-test-'));
test('project contract checks duplicate IDs',()=>{const p=structuredClone(template);p.scenes.push(structuredClone(p.scenes[0]));assert.throws(()=>assertConfig(p),/Duplicate/);assert.equal(assertConfig(template).scenes.length,2);});
test('repo inventory excludes secrets, symlinks and dependencies',()=>{const dir=tmp();fs.mkdirSync(path.join(dir,'src'));fs.mkdirSync(path.join(dir,'node_modules'));fs.writeFileSync(path.join(dir,'src','page.tsx'),'export const Page = 1');fs.writeFileSync(path.join(dir,'src','.env'),'PASSWORD=bad');fs.writeFileSync(path.join(dir,'node_modules','bad.js'),'x');const config={...template,sourcePath:'src'};const report=inspect(dir,config);assert.equal(report.fileCount,1);assert.equal(report.skipped,1);assert.ok(fs.existsSync(path.join(dir,'.avp','intelligence','inventory.json')));});
test('scene cache invalidates preview when capture is rebuilt',()=>{const dir=tmp(),config=structuredClone(template),scene=config.scenes[0],state=loadState(dir),ss=sceneState(state,scene.id);const base=path.join(dir,'.avp','scenes',scene.id);fs.mkdirSync(base,{recursive:true});for(const n of ['capture','captions','preview']){const file=path.join(base,`${n}.mp4`);fs.writeFileSync(file,n);const h=(awaitImportHashes(scene,config))[n];recordArtifact(dir,state,scene,n,file,h);}let before=staleParts(scene,config,ss,dir);assert.equal(before.capture,false);assert.equal(before.preview,false);recordArtifact(dir,state,scene,'capture',path.join(base,'capture.mp4'),awaitImportHashes(scene,config).capture);assert.equal(staleParts(scene,config,ss,dir).preview,true);});
function awaitImportHashes(scene,config){return {capture:sha({capture:scene.capture,duration:scene.durationSec}),captions:sha({narration:scene.narration,language:config.language?.subtitles}),preview:sha({duration:scene.durationSec,style:config.style||{}})};}
test('coverage and storyboard reviews expire after config edit',()=>{const dir=tmp(),config=structuredClone(template),state=loadState(dir);approve(dir,state,config,'coverage');gate(state,config,'coverage');const modified=structuredClone(config);modified.title+=' new';assert.throws(()=>gate(state,modified,'coverage'),/invalidated/);});
test('approval locks scene only after fresh artifacts',()=>{const dir=tmp(),config=structuredClone(template),state=loadState(dir);assert.throws(()=>approve(dir,state,config,'scene',config.scenes[0].id),/missing or stale/);});
