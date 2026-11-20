import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {readJson,writeJson,sceneDir} from '../src/utils.mjs';

const repo=path.resolve(import.meta.dirname,'..');
const skip=process.env.AVP_BROWSER_SMOKE!=='1';
const execute=(root,...args)=>{
  const result=spawnSync(process.execPath,[path.join(repo,'bin','avp.mjs'),...args,'--project',root],
    {encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
  assert.equal(result.status,0,result.stderr||result.stdout||result.error?.message);
  return result.stdout;
};
async function reservePort(){
  const server=net.createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
async function waitForServer(url){
  for(let i=0;i<90;i++){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(500)});
      if(response.ok)return;
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw Error('Local AVP sample server did not start');
}
test('default strict demo captures two real browser scenes, binds claims, and renders an approved MP4',{
  skip,timeout:150000
},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-default-e2e-'));
  const port=await reservePort();
  const server=spawn(process.execPath,[path.join(repo,'examples','sample-app','server.mjs')],
    {cwd:repo,env:{...process.env,PORT:String(port)},stdio:'ignore'});
  try{
    await waitForServer('http://127.0.0.1:'+port);
    const config=readJson(path.join(repo,'examples','sample-project','project.json'));
    assert.equal(config.verification.mode,'claims');
    config.sourcePath=path.join(repo,'examples','sample-app');
    config.appUrl='http://127.0.0.1:'+port;
    config.voiceover.enabled=false;
    config.render={engine:'ffmpeg',width:640,height:360,fps:24,captionsBurned:false};
    for(const scene of config.scenes)scene.durationSec=3;
    writeJson(path.join(root,'project.json'),config);
    execute(root,'plan');
    execute(root,'approve','--stage','coverage');
    execute(root,'approve','--stage','storyboard');
    for(const scene of config.scenes){
      const output=JSON.parse(execute(root,'capture','--scene',scene.id));
      assert.equal(output.report.status,'PASS');
      assert.ok(output.report.captureHash);
      assert.ok(output.report.assertions.every(a=>a.pass));
      execute(root,'captions','--scene',scene.id);
      execute(root,'preview','--scene',scene.id);
      const qa=JSON.parse(execute(root,'qa','--scene',scene.id));
      assert.equal(qa.pass,true,JSON.stringify(qa));
      assert.equal(qa.checks.claimEvidence,true);
      execute(root,'approve','--stage','scene','--scene',scene.id);
    }
    const proof=JSON.parse(execute(root,'evidence'));
    assert.equal(proof.ready,true,JSON.stringify(proof));
    assert.equal(proof.scenes.filter(s=>s.status==='VERIFIED_ASSERTIONS').length,2);
    const final=JSON.parse(execute(root,'render'));
    assert.equal(final.pass,true);
    execute(root,'approve','--stage','final');
    assert.ok(fs.statSync(path.join(root,'.avp','output','final.mp4')).size>3000);
    // Previously approved video cannot bypass tampering with proof after QA.
    const evidenceFile=path.join(sceneDir(root,config.scenes[0].id),'capture-report.json');
    const changed=readJson(evidenceFile);changed.assertions[0].pass=false;writeJson(evidenceFile,changed);
    const blocked=spawnSync(process.execPath,[path.join(repo,'bin','avp.mjs'),'render','--project',root],
      {encoding:'utf8',timeout:10000});
    assert.notEqual(blocked.status,0);
    assert.match(blocked.stderr,/evidence|QA|stale/i);
  }finally{
    server.kill('SIGTERM');
    fs.rmSync(root,{recursive:true,force:true});
  }
});
