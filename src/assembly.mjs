import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {run,fileHash} from './utils.mjs';
import {assemblyTimeline} from './assembly-policy.mjs';
function duration(file){
  const p=JSON.parse(run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file]));
  const v=p.streams.find(s=>s.codec_type==='video'),a=p.streams.find(s=>s.codec_type==='audio');
  if(!v||!a)throw Error('Transition inputs require video and audio');
  const seconds=Number(p.format.duration);
  if(!Number.isFinite(seconds)||seconds<=0)throw Error('Invalid transition input duration');
  return seconds;
}
function boundary(file,output,last){
  run('ffmpeg',['-y','-nostdin','-v','error',...(last?['-sseof','-0.5']:[]),'-i',file,'-map','0:v:0','-an',
    ...(last?['-update','1']:['-frames:v','1']),'-threads','1',output],{timeout:60000});
  if(!fs.existsSync(output)||!fs.statSync(output).size)throw Error('Missing boundary frame');
}
export function renderAssembly(config,previews,output){
  const measured=previews.map(duration),timeline=assemblyTimeline(config,measured),{fps,frames}=timeline.policy;
  const w=config.render?.width||1920,h=config.render?.height||1080;
  if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<2||h<2||w%2||h%2||w>3840||h>2160)throw Error('Transition assembly requires even bounded output dimensions');
  if(config.creative?.director?.maxDurationSec!==undefined&&timeline.durationSec>config.creative.director.maxDurationSec+.001)throw Error('Measured assembly exceeds creative maximum duration');
  const originalHashes=previews.map(fileHash),work=fs.mkdtempSync(path.join(os.tmpdir(),'avp-assembly-'));
  try{
    const inputs=[],filters=[];
    for(const [i,seg] of timeline.segments.entries()){
      const sec=seg.durationFrames/fps;
      let input;
      if(seg.kind==='scene')input=previews[config.scenes.findIndex(s=>s.id===seg.sceneId)];
      else{
        const index=config.scenes.findIndex(s=>s.id===seg.fromScene),left=path.join(work,i+'-left.png'),right=path.join(work,i+'-right.png');
        boundary(previews[index],left,true);boundary(previews[index+1],right,false);
        input=path.join(work,i+'-bridge.mp4');
        const end=(frames-1)/fps;
        // Blend actual last/first decoded boundary stills; no action is synthesized, no approved frames removed.
        run('ffmpeg',['-y','-nostdin','-v','error','-filter_complex_threads','1','-loop','1','-framerate',String(fps),'-i',left,
          '-loop','1','-framerate',String(fps),'-i',right,'-f','lavfi','-i','anullsrc=r=48000:cl=stereo',
          '-filter_complex',`[0:v]scale=${w}:${h},setsar=1,format=yuv420p[a];[1:v]scale=${w}:${h},setsar=1,format=yuv420p[b];[a][b]blend=all_expr='A*(1-min(1,T/${end}))+B*min(1,T/${end})'[v]`,
          '-map','[v]','-map','2:a:0','-t',String(sec),'-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2',input],{timeout:120000});
        seg.bridgeHash=fileHash(input);seg.fromPreviewHash=originalHashes[index];seg.toPreviewHash=originalHashes[index+1];
      }
      inputs.push('-i',input);
      // Use measured format duration rounded UP to frame boundary; pad audio/video tail only.
      filters.push(`[${i}:v]fps=${fps},scale=${w}:${h},setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${seg.durationFrames},setpts=PTS-STARTPTS[v${i}]`);
      filters.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${sec},asetpts=PTS-STARTPTS[a${i}]`);
    }
    const labels=timeline.segments.map((_,i)=>`[v${i}][a${i}]`).join('');
    filters.push(labels+`concat=n=${timeline.segments.length}:v=1:a=1[v][a]`);
    run('ffmpeg',['-y','-nostdin','-v','error','-filter_complex_threads','1',...inputs,'-filter_complex',filters.join(';'),'-map','[v]','-map','[a]',
      '-c:v','libx264','-preset','veryfast','-crf',String(config.productionQuality.exportCrf??20),'-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-b:a','160k','-movflags','+faststart',output],{timeout:300000});
    if(previews.some((f,i)=>fileHash(f)!==originalHashes[i]))throw Error('Approved preview changed during assembly');
    const observed=duration(output);
    if(Math.abs(observed-timeline.durationSec)>Math.max(.12,2/fps))throw Error('Assembled duration does not match frame timeline');
    return timeline;
  }finally{fs.rmSync(work,{recursive:true,force:true});}
}
