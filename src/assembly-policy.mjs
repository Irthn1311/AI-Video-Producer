// Pure assembly policy. Additive transitions never remove approved scene time.
export function assemblyPolicy(config){
  const a=config.assembly;if(a===undefined)return null;
  if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>k!=='transition')||
     !a.transition||typeof a.transition!=='object'||Array.isArray(a.transition)||
     Object.keys(a.transition).some(k=>!['type','durationSec'].includes(k))||
     a.transition.type!=='crossfade-hold'||!Number.isFinite(a.transition.durationSec)||a.transition.durationSec<.25||a.transition.durationSec>1.5)
    throw Error('assembly.transition requires crossfade-hold durationSec 0.25–1.5');
  if(config.productionQuality===undefined||(config.render?.engine||'ffmpeg')!=='ffmpeg')throw Error('Additive transitions require productionQuality and FFmpeg final assembly');
  const fps=config.render?.fps||30;
  if(!Number.isInteger(fps)||fps<12||fps>60)throw Error('Transition assembly requires integer fps 12–60');
  if(!Array.isArray(config.scenes)||config.scenes.length<2||config.scenes.length>20)throw Error('Transition assembly requires 2–20 scenes');
  const frames=Math.round(a.transition.durationSec*fps);
  return {type:'crossfade-hold',frames,fps,durationSec:frames/fps,scope:'ADDITIVE_SILENT_BOUNDARY_FRAME_BLEND'};
}
export function plannedAssemblySec(config){
  const p=assemblyPolicy(config);
  return config.scenes.reduce((n,s)=>n+s.durationSec,0)+(p?(config.scenes.length-1)*p.durationSec:0);
}
export function assemblyTimeline(config,measured){
  const p=assemblyPolicy(config);if(!p)throw Error('No transition policy');
  if(!Array.isArray(measured)||measured.length!==config.scenes.length)throw Error('Missing measured scene durations');
  const segments=[];let cursor=0;
  for(const [i,s] of config.scenes.entries()){
    const duration=measured[i];
    if(!Number.isFinite(duration)||duration<=0||duration>901)throw Error('Invalid scene duration');
    const frames=Math.ceil(duration*p.fps-1e-6);
    segments.push({kind:'scene',sceneId:s.id,fromFrame:cursor,durationFrames:frames});cursor+=frames;
    if(i<config.scenes.length-1){segments.push({kind:'transition',fromScene:s.id,toScene:config.scenes[i+1].id,fromFrame:cursor,durationFrames:p.frames});cursor+=p.frames;}
  }
  return {schemaVersion:1,policy:p,segments,totalFrames:cursor,durationSec:cursor/p.fps};
}
