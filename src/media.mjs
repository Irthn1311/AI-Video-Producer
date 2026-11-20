import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {run,readJson,writeJson,sceneDir,avpDir,loadEnv,sha,atomicWrite} from './utils.mjs';
import {recordArtifact,inputHashes,sceneState,saveState,requireUnlocked,staleParts,gate} from './state.mjs';
const seconds=(value)=>Number(value||0);
export function probe(file){return JSON.parse(run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file]));}
export function mediaSeconds(file){return seconds(probe(file).format?.duration);}
export function locator(page,action){if(action.testId)return page.getByTestId(action.testId);if(action.role)return page.getByRole(action.role,action.name?{name:action.name,exact:true}:{});if(action.label)return page.getByLabel(action.label,{exact:true});if(action.text)return page.getByText(action.text,{exact:true});throw Error('Action requires testId, role, label, or text (avoid brittle CSS selectors)');}
export async function capture(root,config,scene,state,opts={}){
  const ss=sceneState(state,scene.id);requireUnlocked(state,scene.id);const parts=staleParts(scene,config,ss,root);if(!parts.capture&&!opts.force)return {reused:true,file:path.join(sceneDir(root,scene.id),'capture.mp4')};
  let chromium;try{({chromium}=await import('@playwright/test'));}catch{throw Error('Playwright not installed. Run npm install, then npx playwright install chromium.');}
  const dir=sceneDir(root,scene.id);fs.mkdirSync(dir,{recursive:true});const raw=path.join(dir,'raw');fs.mkdirSync(raw,{recursive:true});
  const browser=await chromium.launch({headless:true});let ctx;const report={scene:scene.id,actions:[],startedAt:new Date().toISOString()};
  try{ctx=await browser.newContext({viewport:{width:config.render?.width||1920,height:config.render?.height||1080},recordVideo:{dir:raw,size:{width:config.render?.width||1920,height:config.render?.height||1080}}});const page=await ctx.newPage();const pageErrors=[];page.on('pageerror',err=>pageErrors.push(err.message));const start=Date.now();
    for(const a of scene.capture.actions){const startAction=Date.now();switch(a.type){
      case 'goto': {const url=new URL(a.path||'/',config.appUrl);const allowed=new URL(config.appUrl);if(url.origin!==allowed.origin)throw Error('Cross-origin navigation blocked for capture');await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});break;}
      case 'click':await locator(page,a).click({timeout:30000});break;
      case 'fill':await locator(page,a).fill(a.value??'');break;
      case 'hover':await locator(page,a).hover({timeout:30000});break;
      case 'waitFor':await locator(page,a).waitFor({state:'visible',timeout:a.timeoutMs||30000});break;
      case 'pause':await page.waitForTimeout(Math.max(0,Math.min(a.ms||500,15000)));break;
      case 'scroll':await page.mouse.wheel(0,a.y||500);break;
      case 'screenshot':await page.screenshot({path:path.join(dir,`${scene.id}-${report.actions.length}.png`)});break;
      default:throw Error('Unsupported capture action: '+a.type);
    }report.actions.push({type:a.type,ms:Date.now()-startAction});}
    let remaining=scene.durationSec*1000-(Date.now()-start);if(remaining>0)await page.waitForTimeout(remaining);
    report.finalUrl=page.url();report.pageErrors=pageErrors;report.elapsedMs=Date.now()-start;
    const video=page.video();await ctx.close();ctx=null;const rawPath=await video.path();
    const output=path.join(dir,'capture.mp4');const tmp=path.join(dir,'capture.new.mp4');run('ffmpeg',['-y','-v','error','-i',rawPath,'-vf',`fps=${config.render?.fps||30},scale=${config.render?.width||1920}:${config.render?.height||1080}:force_original_aspect_ratio=decrease,pad=${config.render?.width||1920}:${config.render?.height||1080}:(ow-iw)/2:(oh-ih)/2`,'-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-an',tmp]);fs.renameSync(tmp,output);
    const h=inputHashes(scene,config);recordArtifact(root,state,scene,'capture',output,h.capture);report.outputDuration=mediaSeconds(output);writeJson(path.join(dir,'capture-report.json'),report);return {file:output,report};
  }catch(e){report.error=e.message;writeJson(path.join(dir,'capture-report.json'),report);throw e;}finally{if(ctx)await ctx.close();await browser.close();}
}
function wavFromPcm(pcm,sampleRate=24000){const b=Buffer.alloc(44);b.write('RIFF',0);b.writeUInt32LE(pcm.length+36,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length,40);return Buffer.concat([b,pcm]);}
export async function voice(root,config,scene,state,opts={}){
  if(config.voiceover?.enabled===false)return {skipped:'disabled'};
  if(config.voiceover?.provider!=='gemini')throw Error('v0.1 includes Gemini TTS adapter only; other providers are extension points.');
  requireUnlocked(state,scene.id);let ss=sceneState(state,scene.id),h=inputHashes(scene,config);if(!staleParts(scene,config,ss,root).voice&&!opts.force)return {reused:true};
  if(!opts.allowPaidApi)throw Error('Voice generation may incur cost. Add --allow-paid-api after verifying provider pricing and script.');
  loadEnv(path.resolve(import.meta.dirname,'..'));loadEnv(root);const key=process.env.GEMINI_API_KEY;if(!key)throw Error('GEMINI_API_KEY missing; copy .env.example to .env and set key locally.');
  const dir=sceneDir(root,scene.id);fs.mkdirSync(dir,{recursive:true});const model=process.env.GEMINI_TTS_MODEL||config.voiceover.model||'gemini-2.5-flash-preview-tts';
  let v=config.voiceover.voice||'Charon';const lang=config.language?.narration||'en-US';const text=`Speak in ${lang}. ${config.voiceover.style||'Clear and conversational'}. Read only the following: ${scene.narration}`;
  const body={contents:[{parts:[{text}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:v}}}}};
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  if(!response.ok())throw Error(`Gemini TTS returned HTTP ${response.status} (response contents withheld)`);
  const json=await response.json();const part=json.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data);if(!part)throw Error('TTS response contains no audio');const mime=part.inlineData.mimeType||'';
  if(!/audio\/(L16|pcm)/i.test(mime))throw Error(`Unsupported raw TTS audio mime type: ${mime}`);
  const rate=Number(mime.match(/rate=(\d+)/i)?.[1]||24000);const pcm=Buffer.from(part.inlineData.data,'base64');if(pcm.length<100||pcm.length%2)throw Error('Invalid PCM audio response');
  const out=path.join(dir,'voice.wav');atomicWrite(out,wavFromPcm(pcm,rate));recordArtifact(root,state,scene,'voice',out,h.voice);
  writeJson(path.join(dir,'voice-report.json'),{provider:'gemini',model,voice:v,language:lang,durationSec:mediaSeconds(out),contentHash:sha(scene.narration),generatedAt:new Date().toISOString(),humanListeningApproved:false});
  return {file:out,durationSec:mediaSeconds(out)};
}
const stamp=t=>{let ms=Math.round(t*1000);const h=Math.floor(ms/3600000);ms%=3600000;const m=Math.floor(ms/60000);ms%=60000;const s=Math.floor(ms/1000);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
function splitSentences(text){return text.match(/[^.!?\n]+(?:[.!?]+|$)/gu)?.map(x=>x.trim()).filter(Boolean)||[];}
export function captions(root,config,scene,state,opts={}){
  requireUnlocked(state,scene.id);const ss=sceneState(state,scene.id);const h=inputHashes(scene,config);if(!staleParts(scene,config,ss,root).captions&&!opts.force)return {reused:true};
  const dir=sceneDir(root,scene.id);fs.mkdirSync(dir,{recursive:true});const audio=path.join(dir,'voice.wav');const duration=fs.existsSync(audio)&&config.voiceover?.enabled!==false?mediaSeconds(audio):scene.durationSec;
  const sentences=splitSentences(scene.narration);const weight=sentences.reduce((a,s)=>a+s.length,0)||1;let cursor=0;const rows=sentences.map(s=>{let start=cursor;cursor+=duration*s.length/weight;return {startMs:Math.round(start*1000),endMs:Math.round(cursor*1000),text:s};});
  const srt=rows.map((r,i)=>`${i+1}\n${stamp(r.startMs/1000)} --> ${stamp(r.endMs/1000)}\n${r.text}\n`).join('\n');const out=path.join(dir,'captions.srt');atomicWrite(out,srt);writeJson(path.join(dir,'captions.json'),{timingMethod:'ESTIMATED proportional text length (not forced alignment)',language:config.language?.subtitles?.[0]||config.language?.narration,rows});recordArtifact(root,state,scene,'captions',out,h.captions);return {file:out,count:rows.length,estimated:true};
}
export function preview(root,config,scene,state,opts={}){
  requireUnlocked(state,scene.id);const ss=sceneState(state,scene.id),parts=staleParts(scene,config,ss,root);if(!parts.preview&&!opts.force)return {reused:true};
  if(parts.capture)throw Error(`Capture missing/stale for ${scene.id}`);if(config.voiceover?.enabled!==false&&parts.voice)throw Error(`Voice missing/stale for ${scene.id}`);if(parts.captions)throw Error(`Captions missing/stale for ${scene.id}`);
  const dir=sceneDir(root,scene.id),clip=path.join(dir,'capture.mp4'),audio=path.join(dir,'voice.wav');const haveVoice=config.voiceover?.enabled!==false;
  const duration=Math.max(scene.durationSec,haveVoice?mediaSeconds(audio)+.5:0);let filters=[`fps=${config.render?.fps||30}`,`scale=${config.render?.width||1920}:${config.render?.height||1080}:force_original_aspect_ratio=decrease`,`pad=${config.render?.width||1920}:${config.render?.height||1080}:(ow-iw)/2:(oh-ih)/2`,`tpad=stop_mode=clone:stop_duration=${Math.ceil(duration+1)}`,`trim=duration=${duration}`,`setpts=PTS-STARTPTS`];
  if(config.render?.captionsBurned!==false&&scene.narration.trim())filters.push("subtitles=captions.srt:force_style='Fontsize=22,Outline=2,Alignment=2,MarginV=36'");
  const args=['-y','-v','error','-i','capture.mp4'];if(haveVoice)args.push('-i','voice.wav');else args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
  const out='preview.new.mp4';args.push('-vf',filters.join(','),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-af','apad','-t',String(duration),'-movflags','+faststart',out);
  run('ffmpeg',args,{cwd:dir});fs.renameSync(path.join(dir,out),path.join(dir,'preview.mp4'));recordArtifact(root,state,scene,'preview',path.join(dir,'preview.mp4'),inputHashes(scene,config).preview);return {file:path.join(dir,'preview.mp4'),duration};
}
export function qaScene(root,config,scene,state){const dir=sceneDir(root,scene.id),file=path.join(dir,'preview.mp4');if(!fs.existsSync(file))throw Error(`Missing ${file}`);const p=probe(file);const v=p.streams.find(x=>x.codec_type==='video'),a=p.streams.find(x=>x.codec_type==='audio');const target=Math.max(scene.durationSec,config.voiceover?.enabled!==false&&fs.existsSync(path.join(dir,'voice.wav'))?mediaSeconds(path.join(dir,'voice.wav'))+.5:0);const checks={videoH264:v?.codec_name==='h264',width:v?.width===(config.render?.width||1920),height:v?.height===(config.render?.height||1080),audioAAC:a?.codec_name==='aac',duration:Math.abs(mediaSeconds(file)-target)<.3,captionsExist:fs.existsSync(path.join(dir,'captions.srt'))};const report={scene:scene.id,checks,pass:Object.values(checks).every(Boolean),durationSec:mediaSeconds(file),captionTiming:'Estimated unless externally aligned',visualReviewByHuman:false};writeJson(path.join(dir,'qa-report.json'),report);return report;}
export function render(root,config,state,opts={}){
  gate(state,config,'coverage');gate(state,config,'storyboard');const outDir=path.join(avpDir(root),'output');fs.mkdirSync(outDir,{recursive:true});
  const previews=[];for(const s of config.scenes){const ss=sceneState(state,s.id);const st=staleParts(s,config,ss,root);if(Object.values(st).some(Boolean))throw Error(`Scene ${s.id} contains stale artifacts: ${Object.entries(st).filter(([,v])=>v).map(([k])=>k)}`);if(config.review.mode==='review'&&!ss.approved)throw Error(`Scene ${s.id} awaits approval (avp approve --stage scene --scene ${s.id})`);previews.push(path.join(sceneDir(root,s.id),'preview.mp4'));}
  if(config.render?.engine==='remotion')return renderRemotion(root,config,state,opts);
  // concat demuxer: all per-scene previews have identical codec, dimensions, audio and fps.
  const list=path.join(outDir,'concat.txt');fs.writeFileSync(list,previews.map(f=>`file '${f.replaceAll("'", "'\\''")}'`).join('\n')+'\n');const out=path.join(outDir,'final.mp4');const tmp=path.join(outDir,'final.new.mp4');
  run('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',tmp]);fs.renameSync(tmp,out);
  const result=probe(out);const report={engine:'ffmpeg',file:out,durationSec:mediaSeconds(out),scenes:config.scenes.length,video:result.streams.find(x=>x.codec_type==='video')?.codec_name,audio:result.streams.find(x=>x.codec_type==='audio')?.codec_name,sceneApprovals:config.scenes.every(s=>sceneState(state,s.id).approved),humanFinalApproval:false};writeJson(path.join(outDir,'final-qa.json'),report);state.output={file:out,createdAt:new Date().toISOString(),hash:sha(fs.readFileSync(out).toString('base64'))};saveState(root,state);return report;
}
async function renderRemotion(root,config,state,opts){
  let bundle,selectComposition,renderMedia;try{({bundle}=await import('@remotion/bundler'));({selectComposition,renderMedia}=await import('@remotion/renderer'));}catch{throw Error('Remotion dependencies unavailable; npm install, or set render.engine to ffmpeg');}
  const work=path.join(avpDir(root),'remotion'),publicDir=path.join(work,'public');fs.mkdirSync(publicDir,{recursive:true});const timeline=[];let from=0;for(const s of config.scenes){const d=sceneDir(root,s.id),source=path.join(d,'preview.mp4');fs.copyFileSync(source,path.join(publicDir,`${s.id}.mp4`));const duration=mediaSeconds(source);timeline.push({id:s.id,from,duration,file:`${s.id}.mp4`});from+=duration;}
  writeJson(path.join(publicDir,'timeline.json'),{scenes:timeline,total:from,fps:config.render?.fps||30,width:config.render?.width||1920,height:config.render?.height||1080});const source=path.join(work,'src','index.tsx');fs.mkdirSync(path.dirname(source),{recursive:true});fs.copyFileSync(path.resolve(import.meta.dirname,'../remotion/src/index.tsx'),source);const serveUrl=await bundle({entryPoint:source,publicDir});const inputProps={timeline:{scenes:timeline,total:from,fps:config.render?.fps||30,width:config.render?.width||1920,height:config.render?.height||1080}};const composition=await selectComposition({serveUrl,id:'AVPVideo',inputProps});const out=path.join(avpDir(root),'output','final.mp4');await renderMedia({serveUrl,composition,inputProps,codec:'h264',audioCodec:'aac',outputLocation:out,crf:20,concurrency:2});const report={engine:'remotion',file:out,durationSec:mediaSeconds(out),scenes:config.scenes.length,captionSource:'burned-in scene previews',humanFinalApproval:false};writeJson(path.join(avpDir(root),'output','final-qa.json'),report);state.output={file:out,createdAt:new Date().toISOString()};saveState(root,state);return report;
}
