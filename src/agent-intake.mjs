import fs from 'node:fs';import path from 'node:path';
import {assertConfig,isWithin,readJson} from './utils.mjs';
import {validateDirector} from './creative-director.mjs';
function required(v,label,max=2000){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(label+' is required');return v.trim();}
function canonicalNewPath(p){
  const missing=[];let at=path.resolve(p);
  while(!fs.existsSync(at)){
    const parent=path.dirname(at);if(parent===at)throw Error('Workspace parent unavailable');
    missing.unshift(path.basename(at));at=parent;
  }
  return path.join(fs.realpathSync(at),...missing);
}
export function initAgentWorkspace(directory,options,templateFile){
  const source=fs.realpathSync(path.resolve(required(options.source,'--source',4096)));
  if(!fs.statSync(source).isDirectory())throw Error('--source must be an existing directory');
  const root=canonicalNewPath(required(directory,'workspace',4096));
  if(isWithin(source,root)||isWithin(root,source))throw Error('Workspace and target source must be separate non-overlapping directories');
  const url=new URL(required(options['app-url'],'--app-url',2000));
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!url.port||Number(url.port)<1024||
    url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('--app-url must be a disposable loopback HTTP origin with explicit unprivileged port');
  const mode=options.mode??'review';if(!['review','autonomous'].includes(mode))throw Error('--mode must be review or autonomous');
  const voice=options.voice??'off';if(!['off','local'].includes(voice))throw Error('--voice must be off or local; configure paid provider explicitly later');
  const lang=options.language??'vi';if(!['vi','en'].includes(lang))throw Error('--language must be vi or en');
  const goal=required(options.goal,'--goal'),audience=required(options.audience,'--audience');
  const title=options.title===undefined?'Application demo':required(options.title,'--title',160);
  const maxSec=options['max-duration']===undefined?60:Number(options['max-duration']);
  if(!Number.isFinite(maxSec)||maxSec<5||maxSec>900)throw Error('--max-duration must be 5–900 seconds');
  const config=readJson(templateFile);
  config.title=title;config.sourcePath=source;config.appUrl=url.origin;config.workflow={requireBuild:true};
  config.review={...config.review,mode,semantic:'required'};
  config.language={script:lang,narration:lang==='vi'?'vi-VN':'en-US',subtitles:[lang]};
  config.voiceover.enabled=voice==='local';config.voiceover.estimatedUsdPerCall=null;
  config.creative={audience,goal,director:{mode:mode==='review'?'interactive':'autonomous',maxDurationSec:maxSec},...(voice==='local'?{timing:{maxSilenceSec:2,actionToleranceSec:.25}}:{})};
  config.productionQuality={};config.verification={mode:'claims'};
  // Valid schema sentinel, not a feature or playable recipe. The required storyboard gate blocks it.
  config.scenes=[{id:'unplanned',title:'Unplanned — replace with source-linked storyboard',durationSec:1,featureIds:[],narration:'',claims:[],capture:{actions:[],evidencePolicy:{requireAssertions:false,failOnPageError:true}}}];
  assertConfig(config);validateDirector(config);
  if(fs.existsSync(root)&&(!fs.statSync(root).isDirectory()||fs.readdirSync(root).length))throw Error('Agent workspace must be new or empty; no overwrite');
  fs.mkdirSync(root,{recursive:true});
  if(fs.realpathSync(root)!==root)throw Error('Workspace path changed; inspect before retry');
  const file=path.join(root,'project.json');
  fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n',{flag:'wx'});
  return {status:'CREATED_UNPLANNED',project:root,source,config:file,mode,voice,language:lang,
    next:'Run avp workflow next --project WORKSPACE; execute only authorized steps; author a source-linked storyboard before Build freeze.',
    permissions:'NO_APP_LAUNCH_NO_PROVIDER_CALL_NO_TARGET_WRITE',semantic:'REQUIRED_DECLARED_REVIEW'};
}
