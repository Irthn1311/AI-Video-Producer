#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs,getProject,writeJson,readJson,avpDir,available,sha,sceneDir} from '../src/utils.mjs';
import {loadState,saveState,sceneState,approve,gate,requireUnlocked,staleParts} from '../src/state.mjs';
import {inspect} from '../src/inspect.mjs';
import {capture,voice,captions,preview,qaScene,render,probe} from '../src/media.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function usage(){console.log(`AI Video Producer v0.1 (local-first, software-demo)
Usage: avp <command> [--project DIR] [--scene ID] [options]
  doctor                     Check Node, FFmpeg/ffprobe, Playwright/Remotion
  init [DIR]                 Copy a project configuration (no API calls)
  inspect                    Inventory source paths without LLM
  plan                       Write feature-coverage and storyboard drafts
  approve --stage STAGE      Approve coverage | storyboard | scene | final
  unlock --scene ID          Unlock an approved scene for deliberate changes
  capture --scene ID         Playwright real UI recording
  attach --scene ID --file VIDEO   Import authentic footage captured separately
  voice --scene ID --allow-paid-api    Gemini TTS (may be billable)
  captions --scene ID        Estimate SRT timestamps (review required)
  preview --scene ID         Render scene with FFmpeg
  qa --scene ID              Probe scene media (technical QA)
  run [--allow-paid-api]     Resume stale steps, respecting review gates
  render                     Concatenate approved scene previews (or Remotion)
  status                     Report artifact/review states
Examples:
  node bin/avp.mjs init examples/my-project
  node bin/avp.mjs run --project examples/my-project
  node bin/avp.mjs approve --project examples/my-project --stage coverage
All video production remains local. No AI is automatically called except opt-in TTS.
`);}
function doctor(){const tools={node:process.version,ffmpeg:available('ffmpeg'),ffprobe:available('ffprobe'),playwright:fs.existsSync(path.join(ROOT,'node_modules','@playwright','test')),remotion:fs.existsSync(path.join(ROOT,'node_modules','remotion'))};console.log(JSON.stringify({tools,notes:['Playwright browser install: npx playwright install chromium','FFmpeg with libx264, libass subtitles recommended','Gemini TTS requires GEMINI_API_KEY in local .env and --allow-paid-api','No API key required for inspect/plan']},null,2));return tools.ffmpeg&&tools.ffprobe?0:1;}
function init(directory){const root=path.resolve(directory||'avp-project');fs.mkdirSync(root,{recursive:true});const dest=path.join(root,'project.json');if(fs.existsSync(dest))throw Error(`Refusing to overwrite ${dest}`);fs.copyFileSync(path.join(ROOT,'templates','project.json'),dest);console.log(`Created ${dest}. Edit sourcePath, appUrl, language, features, scenes before running.`);}
function plan(root,config){const dir=path.join(avpDir(root),'planning');fs.mkdirSync(dir,{recursive:true});const cover=path.join(dir,'feature-coverage.json');if(!fs.existsSync(cover))writeJson(cover,{schemaVersion:1,generatedAt:new Date().toISOString(),status:'DRAFT — agent must verify runtime features',features:[...new Set(config.scenes.flatMap(s=>s.featureIds||[]))].map(id=>({id,includedInScenes:config.scenes.filter(s=>(s.featureIds||[]).includes(id)).map(s=>s.id),verifiedInBrowser:false,evidence:[]})),unlistedFeatures:'Agent must inspect target and explain exclusions before approval'});const board=path.join(dir,'storyboard.json');writeJson(board,{schemaVersion:1,title:config.title,scenes:config.scenes.map(s=>({id:s.id,title:s.title,durationSec:s.durationSec,featureIds:s.featureIds||[],narration:s.narration,actions:s.capture.actions})),status:'DRAFT — human should review before capture'});return {featureCoverage:cover,storyboard:board,durationSec:config.scenes.reduce((a,s)=>a+s.durationSec,0)};}
function chooseScene(config,args){const id=args.scene;if(!id)throw Error('Use --scene ID');const scene=config.scenes.find(x=>x.id===id);if(!scene)throw Error(`Unknown scene: ${id}`);return scene;}
async function buildScene(root,config,state,scene,args){if(config.review.mode==='review'){gate(state,config,'coverage');gate(state,config,'storyboard');}const ss=sceneState(state,scene.id);if(ss.locked){const st=staleParts(scene,config,ss,root);if(Object.values(st).some(Boolean))throw Error(`Locked scene ${scene.id} is stale. Review changes and explicitly unlock.`);return {scene:scene.id,skipped:'locked'};}
  const results={scene:scene.id};const stale=staleParts(scene,config,ss,root);
  if(stale.capture)results.capture=await capture(root,config,scene,state);
  if(config.voiceover.enabled!==false&&staleParts(scene,config,ss,root).voice)results.voice=await voice(root,config,scene,state,{allowPaidApi:!!args['allow-paid-api']});
  if(staleParts(scene,config,ss,root).captions)results.captions=captions(root,config,scene,state);
  if(staleParts(scene,config,ss,root).preview)results.preview=preview(root,config,scene,state);
  results.qa=qaScene(root,config,scene,state);if(!results.qa.pass)throw Error(`Scene ${scene.id} failed technical QA`);
  if(config.review.mode==='review'&&config.review.eachScene!==false)throw Error(`Scene ${scene.id} ready for review. Inspect .avp/scenes/${scene.id}/preview.mp4 then approve --stage scene --scene ${scene.id}`);
  return results;
}
async function main(){const args=parseArgs(process.argv.slice(2));const command=args._[0]||'help';if(['help','--help','-h'].includes(command)){usage();return;}if(command==='doctor'){process.exitCode=doctor();return;}if(command==='init'){init(args._[1]||args.project);return;}const {root,config}=getProject(args.project||'.');const state=loadState(root);
  switch(command){
    case 'inspect':console.log(JSON.stringify(inspect(root,config),null,2));break;
    case 'plan':console.log(JSON.stringify(plan(root,config),null,2));break;
    case 'approve':{const stage=args.stage;if(!stage)throw Error('Use --stage coverage|storyboard|scene|final');if(stage==='coverage'||stage==='storyboard'){const file=path.join(avpDir(root),'planning',stage==='coverage'?'feature-coverage.json':'storyboard.json');if(!fs.existsSync(file))throw Error('Generate and review plans first: avp plan');}if(stage==='scene'){const sc=chooseScene(config,args);const q=path.join(sceneDir(root,sc.id),'qa-report.json');if(!fs.existsSync(q)||!readJson(q).pass)throw Error('Run avp qa and review a passing preview before approval');}approve(root,state,config,stage,args.scene);console.log(`Approved ${stage}${args.scene?' '+args.scene:''}`);break;}
    case 'unlock':{const s=chooseScene(config,args),ss=sceneState(state,s.id);if(!ss.locked)throw Error('Scene is not locked');ss.locked=false;ss.approved=false;state.history.push({event:'unlocked',scene:s.id,at:new Date().toISOString()});saveState(root,state);console.log(`Unlocked ${s.id}`);break;}
    case 'capture':{const s=chooseScene(config,args);gate(state,config,'coverage');gate(state,config,'storyboard');console.log(JSON.stringify(await capture(root,config,s,state,{force:!!args.force}),null,2));break;}
    case 'attach':{const s=chooseScene(config,args);if(!args.file)throw Error('Specify --file path/to/authentic-video.mp4');requireUnlocked(state,s.id);const file=path.resolve(args.file);if(!fs.existsSync(file))throw Error('File not found');const p=probe(file);if(!p.streams.some(x=>x.codec_type==='video'))throw Error('Not a video');const dir=sceneDir(root,s.id);fs.mkdirSync(dir,{recursive:true});const output=path.join(dir,'capture.mp4');const temp=path.join(dir,'capture.attach.mp4');const {run}=await import('../src/utils.mjs');run('ffmpeg',['-y','-v','error','-i',file,'-vf',`fps=${config.render.fps},scale=${config.render.width}:${config.render.height}:force_original_aspect_ratio=decrease,pad=${config.render.width}:${config.render.height}:(ow-iw)/2:(oh-ih)/2`,'-an','-c:v','libx264','-pix_fmt','yuv420p',temp]);fs.renameSync(temp,output);const {inputHashes,recordArtifact}=await import('../src/state.mjs');recordArtifact(root,state,s,'capture',output,inputHashes(s,config).capture);console.log(`Attached authentic recorded footage for ${s.id}`);break;}
    case 'voice':console.log(JSON.stringify(await voice(root,config,chooseScene(config,args),state,{allowPaidApi:!!args['allow-paid-api'],force:!!args.force}),null,2));break;
    case 'captions':console.log(JSON.stringify(captions(root,config,chooseScene(config,args),state,{force:!!args.force}),null,2));break;
    case 'preview':console.log(JSON.stringify(preview(root,config,chooseScene(config,args),state,{force:!!args.force}),null,2));break;
    case 'qa':console.log(JSON.stringify(qaScene(root,config,chooseScene(config,args),state),null,2));break;
    case 'run':{gate(state,config,'coverage');gate(state,config,'storyboard');for(const scene of config.scenes){const r=await buildScene(root,config,state,scene,args);console.log(JSON.stringify(r));}console.log(JSON.stringify(await render(root,config,state),null,2));break;}
    case 'render':console.log(JSON.stringify(await render(root,config,state),null,2));break;
    case 'status':{const scenes=config.scenes.map(s=>{let ss=sceneState(state,s.id);return {id:s.id,locked:ss.locked,approved:ss.approved,stale:staleParts(s,config,ss,root)};});console.log(JSON.stringify({project:config.title,mode:config.review.mode,reviews:state.reviews,scenes,output:state.output||null},null,2));break;}
    default:throw Error(`Unknown command ${command}. Run avp help.`);
  }
}
main().catch(e=>{console.error(`AVP ERROR: ${e.message}`);process.exitCode=1;});
