import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readJson,writeJson,sceneDir} from '../src/utils.mjs';

const repo=path.resolve(import.meta.dirname,'..');
const ffmpeg=spawnSync('ffmpeg',['-version'],{encoding:'utf8'});
const skip=process.env.AVP_REMOTION_SMOKE!=='1'||!!ffmpeg.error;
const execute=(name,args,timeout=90_000)=>{
  const r=spawnSync(name,args,{encoding:'utf8',timeout,maxBuffer:2*1024*1024});
  assert.equal(r.status,0,(r.stderr||r.stdout||r.error?.message||'').slice(-3000));
  return r.stdout;
};

test('actual Remotion scene edit renders authentic-source MP4, keeps audio track, passes QA',{
  skip,timeout:180_000
},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-real-remotion-'));
  try{
    fs.mkdirSync(path.join(root,'app'));
    fs.writeFileSync(path.join(root,'app','index.js'),'export const demo=true;');
    const config=readJson(path.join(repo,'templates','project.json'));
    config.sourcePath='app';config.review.mode='autonomous';config.voiceover.enabled=false;
    config.render={engine:'ffmpeg',width:320,height:180,fps:24,captionsBurned:true};
    config.scenes=[{
      ...config.scenes[0],id:'edited-demo',durationSec:4,narration:'Real demo scene.',
      edit:{
        chapter:'MathMate parity',
        shots:[
          {durationSec:1.5,trimStartSec:.25,zoom:1.05,focus:{x:.65,y:.4},label:'Live UI'},
          {durationSec:2.5,trimStartSec:1.5,trimEndSec:2.5,playbackRate:1.25}
        ],
        insets:[{asset:'mobile',startSec:.5,durationSec:2,x:.7,y:.1,width:.25,height:.75,label:'Mobile'}],
        callouts:[{text:'Verified scene test',startSec:1,durationSec:1.5,position:'top-right'}]
      }
    }];
    writeJson(path.join(root,'project.json'),config);
    const clip=path.join(root,'capture-source.mp4');
    execute('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=24:d=3',
      '-c:v','libx264','-pix_fmt','yuv420p',clip]);
    const mobile=path.join(root,'mobile-source.mp4');
    execute('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=green:s=120x220:r=24:d=1.5',
      '-c:v','libx264','-pix_fmt','yuv420p',mobile]);
    const cmd=(...args)=>execute(process.execPath,[path.join(repo,'bin','avp.mjs'),...args,'--project',root],150_000);
    cmd('attach','--scene','edited-demo','--file',clip);
    cmd('asset','add','--scene','edited-demo','--name','mobile','--file',mobile);
    cmd('captions','--scene','edited-demo');
    const result=JSON.parse(cmd('preview','--scene','edited-demo'));
    assert.equal(result.engine,'remotion-scene');
    assert.equal(result.shots,2);assert.equal(result.insets,1);
    const qa=JSON.parse(cmd('qa','--scene','edited-demo'));
    assert.equal(qa.pass,true,JSON.stringify(qa));
    const plan=readJson(path.join(sceneDir(root,'edited-demo'),'edit-plan.json'));
    assert.equal(plan.durationInFrames,96);
    const preview=path.join(sceneDir(root,'edited-demo'),'preview.mp4');
    assert.ok(fs.statSync(preview).size>3000);
    const probe=JSON.parse(execute('ffprobe',['-v','error','-show_streams','-show_format','-of','json',preview]));
    assert.ok(probe.streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264'));
    assert.ok(probe.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac'));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
