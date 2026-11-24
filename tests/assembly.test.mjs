import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {assemblyPolicy,assemblyTimeline,plannedAssemblySec} from '../src/assembly-policy.mjs';
import {renderAssembly} from '../src/assembly.mjs';
import {run,fileHash,available} from '../src/utils.mjs';
const config={productionQuality:{},render:{engine:'ffmpeg',fps:24,width:160,height:90},scenes:[{id:'a',durationSec:1},{id:'b',durationSec:1}],assembly:{transition:{type:'crossfade-hold',durationSec:.5}}};
test('additive frame timeline offsets include bridge time and round scene up, never overlap',()=>{
  const p=assemblyTimeline(config,[1.001,1.01]);assert.deepEqual(p.segments.map(x=>[x.kind,x.fromFrame,x.durationFrames]),[['scene',0,25],['transition',25,12],['scene',37,25]]);
  assert.equal(plannedAssemblySec(config),2.5);
  assert.throws(()=>assemblyPolicy({...config,productionQuality:undefined}));assert.throws(()=>assemblyPolicy({...config,assembly:{transition:{type:'cut',durationSec:.5}}}));
});
test('real additive crossfade retains source hashes and produces blended boundary frames',{skip:!available('ffmpeg')||!available('ffprobe'),timeout:120000},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-assembly-test-'));
  try{
    const sources=['red','blue'].map(c=>{const f=path.join(root,c+'.mp4');run('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c='+c+':s=160x90:r=24','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',f]);return f;});
    const hashes=sources.map(fileHash),out=path.join(root,'final.mp4'),p=renderAssembly(config,sources,out);
    assert.deepEqual(sources.map(fileHash),hashes);assert.equal(p.segments.length,3);
    const sample=path.join(root,'pixel.rgb');run('ffmpeg',['-y','-v','error','-ss',String((p.segments[1].fromFrame+6)/24),'-i',out,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo',sample]);
    const [r,g,b]=fs.readFileSync(sample);assert.ok(r>60&&b>60&&g<50,JSON.stringify({r,g,b}));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
