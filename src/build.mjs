import fs from 'node:fs';
import path from 'node:path';
import {available,avpDir,readJson,writeJson,sha,fileHash,loadEnv} from './utils.mjs';
import {inspect,sourceFingerprint} from './inspect.mjs';
import {analyzeProject} from './project-intelligence.mjs';
import {matchProjectCapabilities} from './skill-discovery.mjs';
import {gate,inputHashes} from './state.mjs';
import {requireCoveragePlan,verificationMode} from './evidence.mjs';
import {rehearsalPath} from './rehearsal.mjs';

const SCHEMA=1;
const files=['project-profile','feature-inventory','capability-profile','toolchain-lock',
  'creative-brief','storyboard','production-plan'];
const actionTypes=new Set(['goto','click','fill','hover','waitFor','pause','scroll','screenshot',
  'assertVisible','assertText','assertAttribute','clickExpectResponse']);
const assertionTypes=new Set(['assertVisible','assertText','assertAttribute','clickExpectResponse']);
const versionedName=name=>name+'.json';
export const buildDir=root=>path.join(avpDir(root),'build');
const file=(root,name)=>path.join(buildDir(root),versionedName(name));
const sourcePlan=(root,name)=>path.join(avpDir(root),'planning',name);
const timestamp=()=>new Date().toISOString();
const exists=f=>fs.existsSync(f);
const repoRoot=path.resolve(import.meta.dirname,'..');

function localModules(){
  const pkgDir=name=>exists(path.join(repoRoot,'node_modules',...name.split('/')));
  return {playwright:pkgDir('@playwright/test'),remotion:pkgDir('@remotion/renderer')&&pkgDir('@remotion/bundler')};
}
export function requiredTools(config){
  const tools=['ffmpeg','ffprobe','playwright'];
  if(config.render?.engine==='remotion'||config.scenes.some(s=>Boolean(s.edit)))tools.push('remotion');
  if(config.voiceover?.enabled!==false)tools.push('gemini-tts');
  return tools;
}
export function toolchainSnapshot(config,root){
  const modules=localModules();
  const required=requiredTools(config);
  if(required.includes('gemini-tts'))loadEnv(root);
  return {schemaVersion:SCHEMA,trustPolicy:'bundled-tools-only',externalInstallations:'NOT_PERMITTED_BY_BUILD',
    tools:[
      {id:'ffmpeg',required:true,available:!!available('ffmpeg'),version:available('ffmpeg')||null,source:'local-executable'},
      {id:'ffprobe',required:true,available:!!available('ffprobe'),version:available('ffprobe')||null,source:'local-executable'},
      {id:'playwright',required:true,available:modules.playwright,version:modules.playwright?'installed-package':null,source:'bundled-package'},
      {id:'remotion',required:required.includes('remotion'),available:modules.remotion,version:modules.remotion?'installed-package':null,source:'bundled-package'},
      {id:'gemini-tts',required:required.includes('gemini-tts'),
        available:required.includes('gemini-tts')?Boolean(process.env.GEMINI_API_KEY):false,
        version:config.voiceover?.model||null,source:'opt-in-provider',credential:'PRESENT_OR_MISSING_ONLY'}
    ]
  };
}
function expectedStoryboard(config){
  return config.scenes.map(s=>({id:s.id,title:s.title,durationSec:s.durationSec,
    featureIds:s.featureIds||[],narration:s.narration,actions:s.capture.actions,
    ...(s.claims!==undefined?{claims:s.claims}:{})}));
}
function makeArtifacts(root,config){
  const inventory=inspect(root,config),analysis=analyzeProject(root,config),matching=matchProjectCapabilities(root,config,{analysis}),sourceHash=inventory.contentFingerprint;
  const source={configHash:sha(config),sourceFingerprint:sourceHash};
  const coverage=sourcePlan(root,'feature-coverage.json');
  const storyboard=sourcePlan(root,'storyboard.json');
  if(!exists(coverage)||!exists(storyboard))
    throw Error('Create candidate coverage and storyboard first: avp plan');
  const features=[...new Set(config.scenes.flatMap(s=>s.featureIds||[]))].sort().map(id=>({
    id,status:'CANDIDATE_NOT_RUNTIME_VERIFIED',confidence:'UNVERIFIED',
    source:'project.json',sceneIds:config.scenes.filter(s=>(s.featureIds||[]).includes(id)).map(s=>s.id)}));
  const profile={schemaVersion:SCHEMA,...source,title:config.title,sourcePath:config.sourcePath,
    appUrl:config.appUrl,analysisLevel:analysis.analysisLevel,
    projectIntelligenceHash:sha(analysis),
    technology:analysis.technology,runtime:analysis.runtime,
    detectedRoutes:analysis.routes,capabilitySignals:analysis.capabilitySignals,
    inspectedSource:analysis.scanned,
    fileCount:inventory.fileCount,importantFiles:inventory.important,
    openQuestions:['Runtime initialization and dependencies must be independently verified',
      'Feature inventory is candidate data until actual Playwright assertions pass']};
  const featureInventory={schemaVersion:SCHEMA,...source,features,
    sourceDiscoveredCandidates:analysis.routes.map(route=>({
      id:'source-route-'+sha(route.path+'|'+route.method).slice(0,12),
      route:route.path,method:route.method,evidence:route.evidence,
      status:'SOURCE_DECLARED_UNVERIFIED',runtimeVerified:false
    })),
    detectedCapabilitySignals:analysis.capabilitySignals,
    note:'Both user-configured features and source route/capability signals remain unverified until runtime evidence.'};
  const capabilityProfile={schemaVersion:SCHEMA,...source,
    strategy:'BUNDLED_FIRST_NO_EXTERNAL_SKILL_INSTALL',
    projectCapabilityNeeds:analysis.capabilitySignals.map(s=>({
      id:s.id,neededCapabilities:s.neededCapabilities,sourceEvidence:s.evidence,
      status:'SOURCE_HYPOTHESIS_NOT_RUNTIME_VERIFIED'
    })),
    matchingMode:matching.mode,registryHash:matching.registryHash,
    matchedRequirements:matching.requirements,
    explicitRequired:matching.explicitRequired,
    unresolved:matching.unresolved,
    limitations:'Bundled implementations are not verified feature workflows. Guidance is not implementation; external repositories are untrusted research only.',
    requirements:config.scenes.map(s=>({
      sceneId:s.id,requiredActions:[...new Set(s.capture.actions.map(a=>a.type))],
      requestedAdapter:s.capture?.adapter||null,
      discoveredExternalSkills:[],unresolvedActions:[...new Set(s.capture.actions.map(a=>a.type))]
        .filter(x=>!actionTypes.has(x)),
      limitations:'External skill/adapter search and authoring not yet automated'
    }))};
  const toolchain={...toolchainSnapshot(config,root),...source,
    domainCapabilityLock:{registryHash:matching.registryHash,requirements:matching.requirements,
      externalInstalls:[],externalSkillsExecuted:false}};
  const brief={schemaVersion:SCHEMA,...source,title:config.title,
    audience:config.creative?.audience??null,
    goal:config.creative?.goal??'Demonstrate observed application functionality',
    creativeStatus:'PROPOSED_REQUIRES_FREEZE_DECISION',
    languages:config.language,frame:{width:config.render?.width||1920,height:config.render?.height||1080,
      fps:config.render?.fps||30},targetDurationSec:config.scenes.reduce((x,s)=>x+s.durationSec,0),
    voice:config.voiceover,reviewMode:config.review?.mode,
    transitionPolicy:'DECLARATIVE_SCENE_EDITS_WHEN_CONFIGURED',
    missingCreativeDetail:['Audience and editorial direction may need agent/user review']};
  const board=readJson(storyboard);
  const boardSnapshot={schemaVersion:SCHEMA,...source,
    sourceFile:'.avp/planning/storyboard.json',sourceHash:fileHash(storyboard),
    scenes:board.scenes};
  const artifacts={
    'project-profile':profile,'feature-inventory':featureInventory,
    'capability-profile':capabilityProfile,'toolchain-lock':toolchain,
    'creative-brief':brief,'storyboard':boardSnapshot
  };
  const refs=Object.fromEntries(Object.entries(artifacts).map(([name,v])=>[name,sha(v)]));
  const production={
    schemaVersion:SCHEMA,...source,
    kind:'BUILD_COMPILED_EXECUTION_CANDIDATE',
    projectIntelligenceHash:sha(analysis),
    domainMatchingHash:sha(matching),
    constraint:'No scene runtime evidence is inherited from a rehearsal',
    artifactHashes:refs,
    coverageHash:fileHash(coverage),storyboardHash:fileHash(storyboard),
    projectConfigHash:sha(config),toolchainHash:sha(toolchain),
    features:features.map(x=>x.id),
    render:config.render,language:config.language,review:config.review,
    maxEstimatedUsd:config.budget?.maxEstimatedUsd??null,
    dependencies:config.production?.sceneDependencies||{},
    scenes:config.scenes.map(s=>({
      id:s.id,title:s.title,durationSec:s.durationSec,featureIds:s.featureIds||[],
      shotIds:(s.edit?.shots?.length?s.edit.shots:[{source:'capture'}]).map((_,i)=>s.id+'-shot-'+String(i+1).padStart(2,'0')),
      captureInputHash:inputHashes(s,config,{},root).capture,
      captureRecipe:s.capture,claims:s.claims||[],narration:s.narration,
      captionTiming:s.captionTiming||null,edit:s.edit||null,
      voice:config.voiceover,attemptLimit:config.budget?.maxRetryPerScene??0,
      startState:'PROJECT_DEFINED_NOT_VERIFIED',
      fallback:'Stop and return to BUILD if rehearsed action or business assertions fail'
    }))
  };
  artifacts['production-plan']=production;
  return artifacts;
}
export function prepareBuild(root,config,{force=false}={}){
  const folder=buildDir(root);fs.mkdirSync(folder,{recursive:true});
  const plan=file(root,'production-plan');
  const currentHash=sha(config),sourceHash=sourceFingerprint(root,config);
  const stateFile=file(root,'build-state');
  if(!force&&exists(stateFile)&&exists(plan)){
    const old=readJson(stateFile);
    if(old.configHash===currentHash&&old.sourceFingerprint===sourceHash){
      const missing=files.filter(name=>!exists(file(root,name)));
      if(!missing.length)return {reused:true,buildDir:folder,status:'PENDING_GATE',
        note:'Use avp build check; edit project.json and --force to regenerate stale Build artifacts.'};
    }
  }
  const built=makeArtifacts(root,config);
  for(const [name,content] of Object.entries(built))writeJson(file(root,name),content);
  writeJson(stateFile,{
    schemaVersion:SCHEMA,configHash:currentHash,sourceFingerprint:sourceHash,
    stages:{intake:'PASS',featureCandidates:'PASS',capabilityMatching:'PASS',
      creativeBrief:'REVIEW_REQUIRED',storyboard:'PENDING',rehearsal:'PENDING',readiness:'PENDING'},
    createdAt:timestamp(),note:'Build drafts are NOT approved or runtime evidence'
  });
  // Existing frozen manifest becomes invalid by content hashes if build inputs change.
  return {reused:false,buildDir:folder,status:'PENDING_GATE',artifacts:Object.keys(built),
    note:'Run avp build rehearse --scene ID --allow-actions against an authorized test app, then build check/freeze.'};
}
function issue(code,message,action){
  return {code,message,action};
}
function checkArtifacts(root,config){
  const problems=[],warnings=[],currentConfig=sha(config),currentSource=sourceFingerprint(root,config);
  const stateFile=file(root,'build-state');
  if(!exists(stateFile)){
    problems.push(issue('BUILD_NOT_PREPARED','Build package is absent','Run avp plan, then avp build prepare'));
    return {problems,warnings,sourceHash:currentSource,configHash:currentConfig};
  }
  const state=readJson(stateFile);
  if(state.schemaVersion!==SCHEMA||state.configHash!==currentConfig)
    problems.push(issue('BUILD_CONFIG_DRIFT','Project config changed since Build preparation','Run avp build prepare --force; rehearse affected scenes'));
  if(state.sourceFingerprint!==currentSource)
    problems.push(issue('BUILD_SOURCE_DRIFT','Repository source changed since Build preparation','Run avp build prepare --force and rehearse'));
  for(const name of files){
    if(!exists(file(root,name)))problems.push(issue('BUILD_ARTIFACT_MISSING','Missing '+name+'.json','Run avp build prepare --force'));
    else {
      const data=readJson(file(root,name));
      if(data.schemaVersion!==SCHEMA||data.configHash!==currentConfig||data.sourceFingerprint!==currentSource)
        problems.push(issue('BUILD_ARTIFACT_STALE',name+' does not match current project/source','Reprepare Build package'));
    }
  }
  if(!problems.length){
    const artifacts=Object.fromEntries(files.map(n=>[n,readJson(file(root,n))]));
    // A mutable draft may be reviewed, but can never be frozen if its recipe
    // differs from the canonical project and inspected source. This rejects
    // accidental/adversarial edits to capture actions in the compiled plan.
    const canonical=makeArtifacts(root,config);
    for(const name of files){
      if(sha(artifacts[name])!==sha(canonical[name]))
        problems.push(issue('BUILD_NONCANONICAL_ARTIFACT',name+' differs from canonical inputs','Edit project.json/reviewed planning, then prepare Build --force'));
    }
    const production=artifacts['production-plan'];
    const expectedRefs=Object.fromEntries(files.filter(n=>n!=='production-plan').map(n=>[n,sha(artifacts[n])]));
    if(sha(production.artifactHashes)!==sha(expectedRefs))
      problems.push(issue('BUILD_MANIFEST_MISMATCH','Production plan does not match Build artifacts','Reprepare Build package'));
    if(production.projectConfigHash!==currentConfig)
      problems.push(issue('BUILD_PLAN_DRIFT','Compiled production plan is stale','Reprepare Build package'));
    const currentTools=toolchainSnapshot(config,root);
    const currentMatching=matchProjectCapabilities(root,config);
    if(sha(artifacts['toolchain-lock'])!==sha({...currentTools,configHash:currentConfig,sourceFingerprint:currentSource,
      domainCapabilityLock:{registryHash:currentMatching.registryHash,requirements:currentMatching.requirements,
        externalInstalls:[],externalSkillsExecuted:false}}))
      problems.push(issue('BUILD_TOOLCHAIN_DRIFT','Local toolchain availability/version changed','Reprepare and rehearse Build'));
    for(const item of currentTools.tools.filter(v=>v.required&&!v.available))
      problems.push(issue('BUILD_TOOL_MISSING',item.id+' is required but unavailable','Install/authorize '+item.id+' then rebuild'));
    for(const req of currentMatching.requirements.filter(x=>x.explicitRequired&&x.status!=='BUNDLED_IMPLEMENTATION_AVAILABLE')){
      problems.push(issue('BUILD_REQUIRED_CAPABILITY_MISSING',req.id+' is explicitly required but only '+req.status,
        'Review/test a project-specific adapter, or revise capabilityRequirements; research candidates cannot authorize execution'));
    }
    const optionalGaps=currentMatching.unresolved.filter(x=>!x.required);
    if(optionalGaps.length)
      warnings.push('Unverified source-derived needs require review; do not promise these features in video until supported: '+optionalGaps.map(x=>x.id).join(', '));
    for(const capability of artifacts['capability-profile'].requirements){
      if(capability.unresolvedActions.length)
        problems.push(issue('BUILD_UNKNOWN_ACTION',capability.sceneId+': '+capability.unresolvedActions.join(', '),'Provide a reviewed, sandboxed project adapter in future adapter flow'));
      if(capability.requestedAdapter)
        problems.push(issue('BUILD_ADAPTER_UNSUPPORTED',capability.sceneId+' requires custom adapter not yet verified','Implement and test adapter before Production'));
    }
    warnings.push('Bundled capability matching only; optional external GitHub search is read-only research, never auto-installed or trusted.');
    if(!artifacts['creative-brief'].audience)
      warnings.push('Audience was not supplied: creative direction should be reviewed before freezing.');
  }
  return {problems,warnings,sourceHash:currentSource,configHash:currentConfig};
}
function verifyRehearsals(root,config){
  const problems=[],proofHashes={};
  for(const scene of config.scenes){
    const target=rehearsalPath(root,scene.id);
    if(!exists(target)){
      problems.push(issue('BUILD_REHEARSAL_MISSING',scene.id+' has no real browser rehearsal','Run avp build rehearse --scene '+scene.id+' --allow-actions'));
      continue;
    }
    const r=readJson(target);
    proofHashes[scene.id]=fileHash(target);
    if(r.status!=='PASS'||r.scope!=='BUILD_REHEARSAL_ONLY'||r.sceneId!==scene.id||
       r.captureInputHash!==inputHashes(scene,config,{},root).capture||
       r.actionsHash!==sha(scene.capture.actions)){
      problems.push(issue('BUILD_REHEARSAL_STALE',scene.id+' rehearsal is failed or stale','Rehearse the current actions against the app'));
      continue;
    }
    const required=scene.capture.actions.filter(a=>assertionTypes.has(a.type));
    const matched=required.every(a=>r.assertions.some(x=>x.id===(a.evidenceId||a.type)&&x.type===a.type&&x.pass===true));
    if(r.actions.length!==scene.capture.actions.length||!matched||
       (scene.capture.evidencePolicy?.requireAssertions&&required.length===0)||
       (scene.capture.evidencePolicy?.failOnPageError!==false&&r.pageErrors?.length)){
      problems.push(issue('BUILD_REHEARSAL_UNVERIFIED',scene.id+' missing required action/DOM/API proof','Fix app/action; rerun rehearsal'));
    }
  }
  return {problems,proofHashes};
}
function checkPlanning(root,config,state){
  const problems=[],review=[];
  const storyboard=sourcePlan(root,'storyboard.json'),coverage=sourcePlan(root,'feature-coverage.json');
  if(!exists(storyboard)||!exists(coverage)){
    problems.push(issue('BUILD_PLANNING_MISSING','Storyboard/coverage drafts missing','Run avp plan'));
    return {problems,review};
  }
  const expected=expectedStoryboard(config);
  if(sha(readJson(storyboard).scenes)!==sha(expected))
    problems.push(issue('BUILD_STORYBOARD_STALE','Storyboard differs from canonical project.json','Revise project.json, then avp plan --force'));
  try{requireCoveragePlan(root,config);}
  catch(e){problems.push(issue('BUILD_COVERAGE_MISMATCH',e.message,'Correct scene/feature coverage and reapprove'));}
  if(exists(file(root,'storyboard'))&&readJson(file(root,'storyboard')).sourceHash!==fileHash(storyboard))
    problems.push(issue('BUILD_STORYBOARD_DRIFT','Build storyboard snapshot differs from reviewed planning artifact','Run avp build prepare --force'));
  if(exists(file(root,'production-plan'))){
    const plan=readJson(file(root,'production-plan'));
    if(plan.coverageHash!==fileHash(coverage)||plan.storyboardHash!==fileHash(storyboard))
      problems.push(issue('BUILD_PLAN_INPUT_DRIFT','Planning artifact changed since Build was prepared','Reprepare Build'));
  }
  if(config.review?.mode==='review'){
    for(const stage of ['coverage','storyboard']){
      try{gate(state,config,stage,root);}
      catch(e){review.push(issue('BUILD_REVIEW_PENDING',e.message,'Review/approve '+stage+' with avp approve --stage '+stage));}
    }
  }
  return {problems,review};
}
function artifactDigests(root){
  return Object.fromEntries(files.map(name=>[name,fileHash(file(root,name))]));
}
function validateLock(root,config,proofHashes){
  const lockFile=file(root,'build-lock');
  if(!exists(lockFile))return false;
  const lock=readJson(lockFile);
  if(lock.schemaVersion!==SCHEMA||lock.configHash!==sha(config)||
     lock.sourceFingerprint!==sourceFingerprint(root,config))return false;
  if(files.some(name=>lock.artifactDigests?.[name]!==fileHash(file(root,name))))return false;
  if(sha(lock.rehearsalDigests)!==sha(proofHashes))return false;
  return true;
}
/** Readiness NEVER assumes a completed rehearsal is evidence for production footage. */
export function checkBuild(root,config,state,{forFreeze=false}={}){
  const a=checkArtifacts(root,config);
  const rehearsal=verifyRehearsals(root,config);
  const planning=checkPlanning(root,config,state);
  const problems=[...a.problems,...rehearsal.problems,...planning.problems];
  const reviews=planning.review;
  const lockValid=!problems.length&&!reviews.length&&validateLock(root,config,rehearsal.proofHashes);
  if(!forFreeze&&!problems.length&&!reviews.length&&!lockValid)
    reviews.push(issue('BUILD_FREEZE_REQUIRED','Build is technically prepared but not frozen','Run avp build freeze after reviewing the production plan'));
  const status=problems.length?'BLOCKED':reviews.length?'REVIEW_REQUIRED':'READY';
  const report={
    schemaVersion:SCHEMA,status,ready:status==='READY',checkedAt:timestamp(),
    projectConfigHash:a.configHash,sourceFingerprint:a.sourceHash,
    problems,reviewRequired:reviews,warnings:a.warnings,
    stages:{
      intake:a.problems.some(x=>x.code.startsWith('BUILD_SOURCE')||x.code.startsWith('BUILD_CONFIG'))?'BLOCKED':'PASS',
      capabilityMatching:a.problems.some(x=>x.code.includes('TOOL')||x.code.includes('ACTION')||x.code.includes('ADAPTER'))?'BLOCKED':'PASS',
      storyboard:planning.problems.length?'BLOCKED':planning.review.length?'REVIEW_REQUIRED':'PASS',
      rehearsal:rehearsal.problems.length?'BLOCKED':'PASS',
      readiness:status
    },
    reminder:'Build rehearsal proves only configuration readiness. Actual scene runtime evidence must be recaptured in Production.'
  };
  if(exists(buildDir(root)))writeJson(file(root,'build-report'),report);
  return report;
}
export function freezeBuild(root,config,state){
  const report=checkBuild(root,config,state,{forFreeze:true});
  if(report.status!=='READY')throw Error('Cannot freeze Build: '+report.status+'; '+[...report.problems,...report.reviewRequired].map(x=>x.code).join(', '));
  const proofHashes=Object.fromEntries(config.scenes.map(s=>[s.id,fileHash(rehearsalPath(root,s.id))]));
  const lock={
    schemaVersion:SCHEMA,frozenAt:timestamp(),configHash:sha(config),
    sourceFingerprint:sourceFingerprint(root,config),
    artifactDigests:artifactDigests(root),rehearsalDigests:proofHashes,
    scope:'APP_TO_VIDEO_ONLY',trust:'LOCAL_HASHES_NOT_CRYPTOGRAPHIC_REMOTE_ATTESTATION',
    planHash:fileHash(file(root,'production-plan')),
    creativeApproval:'EXPLICIT_BUILD_FREEZE',
    note:'Approved Build input is not runtime proof of produced scenes'
  };
  writeJson(file(root,'build-lock'),lock);
  const final=checkBuild(root,config,state);
  if(final.status!=='READY')throw Error('Build freeze consistency check failed');
  return {status:'READY',frozenAt:lock.frozenAt,planHash:lock.planHash,
    sceneCount:config.scenes.length,buildLock:file(root,'build-lock')};
}
export function requiresBuild(root,config){
  return config.workflow?.requireBuild===true||exists(file(root,'build-state'));
}
/** Legacy projects remain compatible until they opt into Build or are initialized with it. */
export function requireBuildGate(root,config,state){
  if(!requiresBuild(root,config))return {status:'LEGACY_NOT_ENFORCED'};
  const r=checkBuild(root,config,state);
  if(!r.ready)throw Error('BUILD GATE '+r.status+': '+[...r.problems,...r.reviewRequired].map(x=>x.code).join(', ')+
    '. See avp build check; do not run Production before a READY frozen Build.');
  return {status:'READY'};
}
