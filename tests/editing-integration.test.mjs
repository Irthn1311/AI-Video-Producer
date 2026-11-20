import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readJson,writeJson,avpDir,sceneDir,assertConfig} from '../src/utils.mjs';
import {inputHashes,staleParts,sceneState} from '../src/state.mjs';

const repo=path.resolve(import.meta.dirname,'..');
const template=readJson(path.join(repo,'templates/project.json'));
const ffmpeg=spawnSync('ffmpeg',['-version'],{encoding:'utf8'});

test('editing changes only the preview input hash, not capture/audio/captions',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-edit-hash-'));
  try{
    fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src','main.ts'),'export const ok = true');
    const config=structuredClone(template);config.sourcePath='src';
    const s=config.scenes[0],before=inputHashes(s,config,{artifacts:{}},root);
    s.edit={chapter:'INTRO',shots:[{durationSec:s.durationSec,zoom:1.06}]};
    assertConfig(config);
    const after=inputHashes(s,config,{artifacts:{}},root);
    assert.equal(after.capture,before.capture);assert.equal(after.voice,before.voice);
    assert.equal(after.captions,before.captions);assert.notEqual(after.preview,before.preview);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('named asset content changes invalidate preview without invalidating capture',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-edit-assets-'));
  try{
    fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src','main.ts'),'const ok=true');
    const config=structuredClone(template);config.sourcePath='src';
    const s=config.scenes[0];s.edit={insets:[{asset:'mobile',startSec:0,durationSec:2,x:.7,y:.1,width:.25,height:.7}]};
    const p=path.join(sceneDir(root,s.id),'assets');fs.mkdirSync(p,{recursive:true});
    const a=path.join(p,'mobile.mp4');fs.writeFileSync(a,'clip-1');
    const before=inputHashes(s,config,{artifacts:{}},root);
    fs.writeFileSync(a,'clip-2');
    const after=inputHashes(s,config,{artifacts:{}},root);
    assert.equal(before.capture,after.capture);assert.equal(before.voice,after.voice);
    assert.notEqual(before.preview,after.preview);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('asset add imports an MP4 through FFmpeg and validates named asset path',{
 skip:!!ffmpeg.error,timeout:30000
},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-asset-cli-'));
  try{
    fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src','main.ts'),'export default 1');
    const config=structuredClone(template);config.sourcePath='src';writeJson(path.join(root,'project.json'),config);
    const source=path.join(root,'original.mp4');
    const created=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=24:d=1','-c:v','libx264','-pix_fmt','yuv420p',source],{encoding:'utf8',timeout:15000});
    assert.equal(created.status,0,created.stderr);
    const args=['node',path.join(repo,'bin','avp.mjs'),'asset','add','--project',root,'--scene',config.scenes[0].id,'--name','mobile','--file',source];
    const added=spawnSync(args[0],args.slice(1),{encoding:'utf8',timeout:15000});
    assert.equal(added.status,0,added.stderr);
    assert.ok(fs.statSync(path.join(sceneDir(root,config.scenes[0].id),'assets','mobile.mp4')).size>100);
    const unsafe=spawnSync(args[0],[...args.slice(1,0),path.join(repo,'bin','avp.mjs'),'asset','add','--project',root,'--scene',config.scenes[0].id,'--name','../secret','--file',source],{encoding:'utf8',timeout:5000});
    assert.notEqual(unsafe.status,0);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
