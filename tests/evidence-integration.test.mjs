import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readJson,writeJson} from '../src/utils.mjs';
import {loadState,approve,gate} from '../src/state.mjs';
const repo=path.resolve(import.meta.dirname,'..');
const template=readJson(path.join(repo,'templates/project.json'));
const run=(root,...args)=>spawnSync(process.execPath,[path.join(repo,'bin/avp.mjs'),...args,'--project',root],{encoding:'utf8',timeout:10000});

test('strict candidate coverage can be approved but cannot impersonate a verified runtime feature',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-evidence-plan-'));
  try{
    fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app','app.js'),'export const v=1;');
    const config=structuredClone(template);config.sourcePath='app';config.verification={mode:'claims'};
    config.scenes=[{...config.scenes[0],featureIds:['demo'],narration:'The app shows a working demo result.',
      claims:[{id:'demo-claim',featureId:'demo',text:'shows a working demo result',evidenceIds:['result-visible']}],
      capture:{evidencePolicy:{requireAssertions:true,failOnPageError:true},actions:[
        {type:'goto',path:'/'},
        {type:'assertVisible',testId:'result',evidenceId:'result-visible'}
      ]}
    }];
    writeJson(path.join(root,'project.json'),config);
    assert.equal(run(root,'plan').status,0);
    const state=loadState(root);
    approve(root,state,config,'coverage');
    approve(root,state,config,'storyboard');
    assert.doesNotThrow(()=>gate(state,config,'storyboard',root));
    const evidence=run(root,'evidence');
    assert.equal(evidence.status,0,evidence.stderr);
    const report=JSON.parse(evidence.stdout);
    assert.equal(report.ready,false);
    assert.equal(report.scenes[0].status,'UNVERIFIED');
    const cover=path.join(root,'.avp','planning','feature-coverage.json');
    const changed=readJson(cover);changed.features[0].includedInScenes=['another-scene'];writeJson(cover,changed);
    assert.throws(()=>approve(root,state,config,'coverage'),/mapping is stale/);
    assert.throws(()=>gate(state,config,'coverage',root),/mapping is stale|planning artifact changes/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
