import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import {readJson,writeJson,sceneDir} from '../src/utils.mjs';
import {capture,captions,preview,qaScene} from '../src/media.mjs';
import {loadState,validateSceneQa} from '../src/state.mjs';

const repo=path.resolve(import.meta.dirname,'..');
test('Playwright captures real DOM + HTTP evidence and binds it to scene QA',{
  skip:process.env.AVP_BROWSER_SMOKE!=='1',timeout:120000
},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-browser-evidence-'));
  const server=http.createServer((req,res)=>{
    if(req.method==='POST'&&req.url==='/api/complete'){
      res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');return;
    }
    res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});
    res.end(`<!doctype html><html><body><h1>Real Dashboard</h1><button data-testid="submit">Save</button>
      <div data-testid="result" data-status="pending" style="display:none">Saved successfully</div>
      <script>document.querySelector('[data-testid="submit"]').onclick=async()=>{
        const r=await fetch('/api/complete',{method:'POST'});
        if(r.ok){const x=document.querySelector('[data-testid="result"]');x.style.display='block';x.dataset.status='done';}
      };</script></body></html>`);
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const port=server.address().port;
    fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app','main.ts'),'export const ok=true');
    const config=readJson(path.join(repo,'templates','project.json'));
    config.sourcePath='app';config.appUrl='http://127.0.0.1:'+port;
    config.voiceover.enabled=false;config.review.mode='autonomous';config.verification={mode:'claims'};
    config.render={engine:'ffmpeg',width:320,height:180,fps:24,captionsBurned:false};
    config.scenes=[{...config.scenes[0],id:'browser-proof',durationSec:3,
      featureIds:['saved-feature'],narration:'The saved result is visible.',
      claims:[{id:'claim-saved',featureId:'saved-feature',text:'The saved result is visible',evidenceIds:['saved-api','result-text']}],capture:{
        evidencePolicy:{requireAssertions:true,failOnPageError:true},
        actions:[
          {type:'goto',path:'/'},
          {type:'assertVisible',role:'heading',name:'Real Dashboard',evidenceId:'dashboard'},
          {type:'clickExpectResponse',testId:'submit',response:{pathContains:'/api/complete',method:'POST',status:200,bodyIncludes:'"ok":true'},evidenceId:'saved-api'},
          {type:'assertText',testId:'result',expectedText:'Saved successfully',evidenceId:'result-text',evidenceScreenshot:true},
          {type:'assertAttribute',testId:'result',attribute:'data-status',expectedValue:'done',evidenceId:'saved-attr'}
        ]
      }}];
    writeJson(path.join(root,'project.json'),config);
    const scene=config.scenes[0],state=loadState(root);
    const result=await capture(root,config,scene,state);
    assert.equal(result.report.status,'PASS');
    assert.equal(result.report.assertions.length,4);
    assert.ok(result.report.assertions.every(x=>x.pass));
    captions(root,config,scene,state);
    await preview(root,config,scene,state);
    const qa=qaScene(root,config,scene,state);
    assert.equal(qa.pass,true,JSON.stringify(qa));
    assert.equal(qa.checks.captureAssertions,true);
    assert.equal(qa.checks.claimEvidence,true);
    assert.deepEqual(qa.claimEvidence.features,['saved-feature']);
    validateSceneQa(root,config,scene,state);
    const evidenceFile=path.join(sceneDir(root,scene.id),'capture-report.json');
    const modified=readJson(evidenceFile);modified.assertions[0].pass=false;writeJson(evidenceFile,modified);
    assert.throws(()=>validateSceneQa(root,config,scene,state),/capture evidence|claim-to-evidence/);
    // A newly false expected result must not be recorded as a successful capture.
    scene.capture.actions.find(a=>a.type==='assertText').expectedText='This text is not on the page';
    await assert.rejects(()=>capture(root,config,scene,state,{force:true}));
    assert.equal(readJson(evidenceFile).status,'FAIL');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
