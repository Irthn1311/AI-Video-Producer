import fs from 'node:fs';
import path from 'node:path';
import {run,readJson,writeJson,avpDir,sceneDir} from './utils.mjs';
import {compileSceneEdit,editAssetNames} from './editing.mjs';
import {masterVoice} from './production-quality.mjs';
import {qualityPolicy} from './quality-policy.mjs';

function seconds(file){
  const data=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration','-of','json',file]));
  const duration=Number(data.format?.duration);
  if(!Number.isFinite(duration)||duration<=0)throw Error('Cannot probe duration: '+file);
  return duration;
}

/**
 * Remotion runs only for scenes opting into scene.edit. A reviewed scene preview
 * is the output of this function, so final concat cannot bypass scene review.
 * This never invokes TTS or an external model.
 */
export async function renderEditedPreview(root,config,scene){
  const dir=sceneDir(root,scene.id),work=path.join(avpDir(root),'remotion-preview',scene.id);
  const publicDir=path.join(work,'public'),footageDir=path.join(publicDir,'footage');
  fs.mkdirSync(footageDir,{recursive:true});
  const sources={};
  const copy=(name,source)=>{if(!fs.existsSync(source))throw Error('Missing edit media: '+source);
    const dest=path.join(footageDir,name+'.mp4');fs.copyFileSync(source,dest);
    sources[name==='capture'?'capture':'asset:'+name]={file:'footage/'+name+'.mp4',durationSec:seconds(dest)};
  };
  copy('capture',path.join(dir,'capture.mp4'));
  for(const name of editAssetNames(scene.edit))copy(name,path.join(dir,'assets',name+'.mp4'));
  const hasVoice=config.voiceover?.enabled!==false;
  const voiceFile=path.join(dir,'voice.wav');
  if(hasVoice){if(!fs.existsSync(voiceFile))throw Error('Voice missing for Remotion edited preview');
    fs.copyFileSync(qualityPolicy(config)?masterVoice(root,config,scene):voiceFile,path.join(publicDir,'voice.wav'));}
  const captionsFile=path.join(dir,'captions.json');
  const captions=fs.existsSync(captionsFile)?readJson(captionsFile).rows:[];
  const fps=config.render?.fps||30;
  const plan=compileSceneEdit(scene,{sources,fps,voiceDurationSec:hasVoice?seconds(voiceFile):0,
    captions,captionsBurned:config.render?.captionsBurned!==false,hasVoice});
  writeJson(path.join(dir,'edit-plan.json'),{...plan,renderWidth:config.render?.width||1920,
    renderHeight:config.render?.height||1080});
  let bundle,selectComposition,renderMedia;
  try{({bundle}=await import('@remotion/bundler'));({selectComposition,renderMedia}=await import('@remotion/renderer'));}
  catch{throw Error('Remotion editing needs installed @remotion/bundler and @remotion/renderer. Run npm install.');}
  const entryPoint=path.resolve(import.meta.dirname,'../remotion/src/scene-preview.tsx');
  const serveUrl=await bundle({entryPoint,publicDir});
  const inputProps={plan,width:config.render?.width||1920,height:config.render?.height||1080};
  const composition=await selectComposition({serveUrl,id:'AVPEditedScene',inputProps});
  const staged=path.join(dir,'preview.edit.new.mp4');
  try{
    await renderMedia({serveUrl,composition,inputProps,codec:'h264',audioCodec:'aac',
      outputLocation:staged,crf:20,concurrency:2});
    if(!hasVoice){
      const muxed=path.join(dir,'preview.with-silence.new.mp4');
      try{
        run('ffmpeg',['-y','-v','error','-i',staged,'-f','lavfi','-i','anullsrc=r=48000:cl=stereo',
          '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','128k',
          '-t',String(plan.durationInFrames/fps),'-movflags','+faststart',muxed]);
        fs.renameSync(muxed,path.join(dir,'preview.mp4'));
      }finally{fs.rmSync(muxed,{force:true});}
    }else if(qualityPolicy(config)){
      const muxed=path.join(dir,'preview.quality.new.mp4');
      try{run('ffmpeg',['-y','-nostdin','-v','error','-i',staged,'-c:v','copy','-c:a','aac','-ar','48000','-ac','2','-b:a','160k','-movflags','+faststart',muxed]);fs.renameSync(muxed,path.join(dir,'preview.mp4'));}finally{fs.rmSync(muxed,{force:true});}
    }else fs.renameSync(staged,path.join(dir,'preview.mp4'));
  }finally{fs.rmSync(staged,{force:true});}
  return {file:path.join(dir,'preview.mp4'),duration:plan.durationInFrames/fps,
    engine:'remotion-scene',shots:plan.shots.length,insets:plan.insets.length,callouts:plan.callouts.length};
}
