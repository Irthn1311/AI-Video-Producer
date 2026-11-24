import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {readJson,writeJson} from '../src/utils.mjs';
import {workflowNext,workflowStep} from '../src/workflow.mjs';
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-workflow-'));
  fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app','main.js'),'export const app=1;');
  const config=readJson(new URL('../templates/project.json',import.meta.url));config.sourcePath='app';config.workflow={requireBuild:true};
  writeJson(path.join(root,'project.json'),config);return {root,config};
}
const cleanup=f=>fs.rmSync(f.root,{recursive:true,force:true});
test('workflow observes, executes bounded analysis and skills, rejects stale task hash and preserves drafts',async()=>{
  const f=fixture();try{
    let n=workflowNext(f.root,f.config);assert.equal(n.kind,'analyze');assert.equal(n.status,'NEXT');
    assert.equal((await workflowStep(f.root,{hash:'bad'})).code,'TASK_HASH_CHANGED');
    const first=await workflowStep(f.root,{hash:n.taskHash});assert.equal(first.status,'EXECUTED');assert.equal(first.next.kind,'skills');
    const second=await workflowStep(f.root,{hash:first.next.taskHash});assert.equal(second.status,'EXECUTED');assert.equal(second.next.kind,'prepare');assert.equal(second.runId,first.runId);
    const prepared=await workflowStep(f.root,{hash:second.next.taskHash});assert.equal(prepared.status,'EXECUTED');
    assert.ok(fs.existsSync(path.join(f.root,'.avp','build','production-plan.json')));
    assert.notEqual(prepared.next.kind,'production');
    fs.writeFileSync(path.join(f.root,'app','main.js'),'export const app=2;');
    assert.equal(workflowNext(f.root,f.config).kind,'analyze');
    assert.equal((await workflowStep(f.root,{hash:second.next.taskHash})).code,'TASK_HASH_CHANGED');
  }finally{cleanup(f);}
});
test('creative and required capability gaps are Agent handoffs, not fabricated plans',async()=>{
  const f=fixture();try{
    f.config.creative={audience:'reviewers',goal:'Show app',director:{mode:'autonomous',maxDurationSec:60}};
    writeJson(path.join(f.root,'project.json'),f.config);
    let n=workflowNext(f.root,f.config);
    for(let i=0;i<2;i++)n=(await workflowStep(f.root,{hash:n.taskHash})).next;
    assert.equal(n.kind,'author-storyboard');assert.equal(n.status,'AGENT_REQUIRED');
    assert.equal((await workflowStep(f.root,{hash:n.taskHash})).status,'AGENT_REQUIRED');
    assert.equal(fs.existsSync(path.join(f.root,'.avp','build','production-plan.json')),false);
  }finally{cleanup(f);}
});
