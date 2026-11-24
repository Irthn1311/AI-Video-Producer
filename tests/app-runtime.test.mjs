import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {appStatus,approveApp,trialApp,withAppRuntime,appRuntimeFingerprint} from '../src/app-runtime.mjs';
import {readJson,writeJson} from '../src/utils.mjs';
async function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-runtime-'));
  const portServer=net.createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));
  const port=portServer.address().port;await new Promise(r=>portServer.close(r));
  fs.mkdirSync(path.join(root,'app'));
  const entry=path.join(root,'app','server.mjs');
  fs.writeFileSync(entry,`import http from 'node:http';let count=0;http.createServer((req,res)=>{if(req.url==='/health'){res.end('ok');return;}res.end(String(++count));}).listen(Number(process.env.PORT),process.env.HOST);`);
  const config=readJson(new URL('../templates/project.json',import.meta.url));config.sourcePath='app';
  config.appUrl='http://127.0.0.1:'+port;
  config.appRuntime={mode:'managed-node',entrypoint:'server.mjs',readinessPath:'/health',startupTimeoutMs:5000,reset:'fresh-process',isolation:'operator-approved-disposable-local-fixture'};
  writeJson(path.join(root,'project.json'),config);
  return {root,entry,port,config};
}
const cleanup=f=>fs.rmSync(f.root,{recursive:true,force:true});
test('reviewed direct child trial, explicit launch, fresh state and cleanup',{timeout:25000},async()=>{
  const f=await fixture();try{
    const {root,config}=f;
    const status=appStatus(root,config);assert.equal(status.status,'REVIEW_REQUIRED');
    assert.throws(()=>approveApp(root,config,{hash:'bad',confirm:true}),/hash/);
    approveApp(root,config,{hash:status.manifestHash,confirm:true});
    await assert.rejects(trialApp(root,config),/allow-launch/);
    assert.equal((await trialApp(root,config,{allowLaunch:true})).status,'TRIAL_PASS');
    await assert.rejects(withAppRuntime(root,config,{allowActions:true},async()=>{}),/allow-launch/);
    for(let i=0;i<2;i++){
      await withAppRuntime(root,config,{allowActions:true,allowLaunch:true},async s=>{
        assert.equal(s.reset,'FRESH_PROCESS_ONLY');
        assert.equal(await (await fetch(config.appUrl)).text(),'1');
        assert.equal(await (await fetch(config.appUrl)).text(),'2');
      });
      await assert.rejects(fetch(config.appUrl,{signal:AbortSignal.timeout(1000)}));
    }
    await assert.rejects(withAppRuntime(root,config,{allowActions:true,allowLaunch:true},async()=>{throw Error('fixture failed');}),/fixture failed/);
    await assert.rejects(fetch(config.appUrl,{signal:AbortSignal.timeout(1000)}));
    assert.equal(fs.existsSync(path.join(root,'.avp','app-runtime','session.lock')),false);
    const before=appRuntimeFingerprint(root,config);fs.appendFileSync(f.entry,'\n// drift');
    assert.notEqual(appRuntimeFingerprint(root,config),before);
    assert.equal(appStatus(root,config).status,'REVIEW_REQUIRED');
  }finally{cleanup(f);}
});
test('occupied port refuses launch without killing unrelated listener',{timeout:15000},async()=>{
  const f=await fixture();const foreign=net.createServer();
  try{
    await new Promise(r=>foreign.listen(f.port,'127.0.0.1',r));
    approveApp(f.root,f.config,{hash:appStatus(f.root,f.config).manifestHash,confirm:true});
    await assert.rejects(trialApp(f.root,f.config,{allowLaunch:true}),e=>e.failureCode==='APP_PORT_OCCUPIED');
    assert.equal(foreign.listening,true);
    assert.equal(appStatus(f.root,f.config).status,'TRIAL_REQUIRED');
  }finally{await new Promise(r=>foreign.close(r));cleanup(f);}
});
test('manifest forbids external origins, traversal, arbitrary shell and missing isolation declaration',async()=>{
  const f=await fixture();try{
    const c=f.config;
    c.appRuntime.entrypoint='../server.mjs';assert.equal(appStatus(f.root,c).status,'INVALID');
    c.appRuntime.entrypoint='server.mjs';c.appUrl='https://example.com:4173';assert.equal(appStatus(f.root,c).status,'INVALID');
    c.appUrl='http://127.0.0.1:'+f.port;c.appRuntime.isolation='unknown';assert.equal(appStatus(f.root,c).status,'INVALID');
  }finally{cleanup(f);}
});
