import fs from 'node:fs';
import path from 'node:path';
import {avpDir,writeJson,sha} from './utils.mjs';
import {inputHashes} from './state.mjs';
import {executeCaptureAction} from './capture-actions.mjs';

export function rehearsalPath(root,sceneId){
  return path.join(avpDir(root),'build','rehearsals',sceneId+'.json');
}

/**
 * Rehearse the EXACT same declarative actions that real Playwright capture will
 * execute, but WITHOUT recording a video, generating voice, or changing scene QA.
 * User must explicitly authorize running potentially state-mutating UI actions.
 */
export async function rehearseScene(root,config,scene,{allowActions=false}={}){
  if(!allowActions)throw Error('Rehearsal interacts with the app. Add --allow-actions for an authorized isolated demo/test environment.');
  let chromium;
  try{({chromium}=await import('@playwright/test'));}
  catch{throw Error('Playwright is not installed. Run npm install and npx playwright install chromium.');}
  const file=rehearsalPath(root,scene.id),fingerprint=inputHashes(scene,config,{},root).capture;
  const record={
    schemaVersion:1,sceneId:scene.id,scope:'BUILD_REHEARSAL_ONLY',status:'RUNNING',
    captureInputHash:fingerprint,actionsHash:sha(scene.capture.actions),
    startedAt:new Date().toISOString(),actions:[],assertions:[],pageErrors:[],
    caution:'Rehearsal is not evidence of the footage produced later.'
  };
  writeJson(file,record);
  let browser,context;
  try{
    browser=await chromium.launch({headless:true});
    context=await browser.newContext({viewport:{width:config.render?.width||1920,height:config.render?.height||1080}});
    const page=await context.newPage();
    page.on('pageerror',err=>record.pageErrors.push(err.message.slice(0,500)));
    for(const action of scene.capture.actions){
      const start=Date.now();
      await executeCaptureAction(page,action,{appUrl:config.appUrl,dir:null,report:record});
      record.actions.push({type:action.type,ms:Date.now()-start});
    }
    if(scene.capture.evidencePolicy?.requireAssertions&&!record.assertions.length)
      throw Error('Required rehearsal assertions are missing');
    if(scene.capture.evidencePolicy?.failOnPageError!==false&&record.pageErrors.length)
      throw Error('Uncaught browser error during rehearsal');
    record.status='PASS';
    record.finishedAt=new Date().toISOString();
    writeJson(file,record);
    return {scene:scene.id,status:record.status,assertions:record.assertions.length,actions:record.actions.length,
      captureInputHash:record.captureInputHash,scope:record.scope};
  }catch(error){
    record.status='FAILED';record.finishedAt=new Date().toISOString();
    record.error=String(error.message||error).slice(0,700);writeJson(file,record);throw error;
  }finally{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});}
}
