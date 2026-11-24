/**
 * Declarative, portable editing contract inspired by the proven MathMate timeline.
 * This module is pure: no FFmpeg, cloud APIs, React, or filesystem side effects.
 */
const finite=(v,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(label+' must be a finite number between '+min+' and '+max);};
const text=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(label+' must be nonempty text up to '+max+' characters');};
const assetName=(v)=>{if(typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v))throw Error('Invalid scene edit asset name');return v;};
const sourceName=(v)=>{if(v==='capture'||v===undefined)return 'capture';if(typeof v==='string'&&v.startsWith('asset:'))return 'asset:'+assetName(v.slice(6));throw Error('Shot source must be capture or asset:NAME');};
const placements=new Set(['top-left','top-right','bottom-left','bottom-right','center']);
const optional=(v,min,max,label)=>{if(v!==undefined)finite(v,min,max,label);};
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fields=(v,allowed,label)=>{if(!record(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw Error('Unexpected '+label+' field');};
const cameraModes=new Set(['static','pulse','push','hold']);
const color=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);
export const defaultVisualTheme={background:'#f5faf7',panel:'#073e32',text:'#ffffff',accent:'#bde7d5'};
function luminance(hex){
  const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return .2126*v[0]+.7152*v[1]+.0722*v[2];
}
function validateTheme(theme){
  fields(theme,['background','panel','text','accent'],'visual theme');
  if(!Object.keys(defaultVisualTheme).every(k=>color(theme[k])))throw Error('Theme requires four #RRGGBB colors');
  const a=luminance(theme.panel),b=luminance(theme.text);
  if((Math.max(a,b)+.05)/(Math.min(a,b)+.05)<4.5)throw Error('Visual panel/text contrast must be at least 4.5:1');
}
export function shotIds(scene){
  const defs=scene.edit?.shots||[{source:'capture'}];
  return defs.map((s,i)=>s.id||scene.id+'-shot-'+String(i+1).padStart(2,'0'));
}
function validateDesign(scene,edit){
  const d=edit.design;
  if(d===undefined)return;
  fields(d,['rationale','framing','theme'],'edit.design');
  text(d.rationale,1000,'edit.design.rationale');
  if(!['stable','adaptive'].includes(d.framing))throw Error('Invalid edit.design.framing');
  validateTheme(d.theme);
  if(!Array.isArray(edit.shots)||!edit.shots.length)throw Error('Designed scene requires explicit shots');
  if(!edit.shots.some(s=>sourceName(s.source)==='capture'))throw Error('Designed scene requires a capture shot');
  const seen=new Set();let total=0;
  for(const s of edit.shots){
    if(typeof s.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(s.id)||seen.has(s.id))throw Error('Designed shots require unique stable IDs');
    seen.add(s.id);total+=s.durationSec;
    text(s.purpose,500,'shot.purpose');
    if(!cameraModes.has(s.camera))throw Error('Designed shots require camera mode');
    if((d.framing==='stable'||s.camera==='static')&&(s.zoom??1)!==1)throw Error('Stable/static framing requires zoom 1');
    if(d.framing==='stable'&&s.camera!=='static')throw Error('Stable framing requires static camera');
    if((s.trimStartSec??0)>0||s.trimEndSec!==undefined||(s.playbackRate??1)!==1)text(s.editReason,500,'shot.editReason');
    if(s.transitionIn!==undefined){
      fields(s.transitionIn,['type','durationSec'],'shot transition');
      if(s.transitionIn.type!=='fade')throw Error('Only in-shot fade is supported');
      finite(s.transitionIn.durationSec,.05,Math.min(1,s.durationSec/3),'transition duration');
    }
  }
  if(Math.abs(total-scene.durationSec)>.001)throw Error('Designed shots must fill scene duration exactly');
}

export function editAssetNames(edit){
  if(!edit)return [];
  const names=new Set();
  for(const s of edit.shots||[]){const source=sourceName(s.source);if(source.startsWith('asset:'))names.add(source.slice(6));}
  for(const s of edit.insets||[])names.add(assetName(s.asset));
  return [...names].sort();
}

export function validateSceneEdit(scene){
  const edit=scene.edit;
  if(edit===undefined)return;
  if(!edit||typeof edit!=='object'||Array.isArray(edit))throw Error('scene.edit must be an object');
  const duration=scene.durationSec;
  finite(duration,1,900,'scene.durationSec');
  if(edit.chapter!==undefined)text(edit.chapter,160,'edit.chapter');
  if(edit.shots!==undefined){
    if(!Array.isArray(edit.shots)||edit.shots.length===0||edit.shots.length>40)throw Error('edit.shots must contain 1–40 shots');
    let total=0;
    for(const [i,s] of edit.shots.entries()){
      const key='edit.shots['+i+']';
      if(!s||typeof s!=='object'||Array.isArray(s))throw Error(key+' must be an object');
      sourceName(s.source);finite(s.durationSec,0.05,900,key+'.durationSec');total+=s.durationSec;
      optional(s.trimStartSec,0,3600,key+'.trimStartSec');
      optional(s.trimEndSec,0.05,3600,key+'.trimEndSec');
      if(s.trimEndSec!==undefined&&s.trimEndSec<=(s.trimStartSec||0))throw Error(key+'.trimEndSec must exceed trimStartSec');
      optional(s.playbackRate,0.25,4,key+'.playbackRate');
      optional(s.zoom,0.5,3,key+'.zoom');
      if(s.focus!==undefined){
        if(!s.focus||typeof s.focus!=='object'||Array.isArray(s.focus))throw Error(key+'.focus must be {x,y}');
        finite(s.focus.x,0,1,key+'.focus.x');finite(s.focus.y,0,1,key+'.focus.y');
      }
      if(s.label!==undefined)text(s.label,120,key+'.label');
    }
    if(total>duration+0.001)throw Error('Sum of edit.shots durations exceeds scene.durationSec');
  }
  if(edit.callouts!==undefined){
    if(!Array.isArray(edit.callouts)||edit.callouts.length>30)throw Error('edit.callouts must be an array of at most 30');
    for(const [i,c] of edit.callouts.entries()){
      const k='edit.callouts['+i+']';
      if(!c||typeof c!=='object'||Array.isArray(c))throw Error(k+' must be an object');
      text(c.text,240,k+'.text');finite(c.startSec,0,duration,k+'.startSec');
      finite(c.durationSec,0.05,900,k+'.durationSec');
      if(c.startSec+c.durationSec>duration+0.001)throw Error(k+' exceeds scene duration');
      if(c.position!==undefined&&!placements.has(c.position))throw Error(k+'.position is unsupported');
    }
  }
  validateDesign(scene,edit);
  if(edit.insets!==undefined){
    if(!Array.isArray(edit.insets)||edit.insets.length>4)throw Error('edit.insets must be an array of at most 4');
    for(const [i,v] of edit.insets.entries()){
      const k='edit.insets['+i+']';
      if(!v||typeof v!=='object'||Array.isArray(v))throw Error(k+' must be an object');
      assetName(v.asset);
      finite(v.startSec,0,duration,k+'.startSec');finite(v.durationSec,0.05,900,k+'.durationSec');
      if(v.startSec+v.durationSec>duration+0.001)throw Error(k+' exceeds scene duration');
      finite(v.x,0,1,k+'.x');finite(v.y,0,1,k+'.y');
      finite(v.width,0.05,1,k+'.width');finite(v.height,0.05,1,k+'.height');
      if(v.x+v.width>1.00001||v.y+v.height>1.00001)throw Error(k+' extends outside the video frame');
      optional(v.trimStartSec,0,3600,k+'.trimStartSec');
      optional(v.playbackRate,0.25,4,k+'.playbackRate');
      if(v.label!==undefined)text(v.label,100,k+'.label');
    }
  }
}

const frames=(sec,fps)=>Math.max(1,Math.round(sec*fps));
function compileMedia(spec,source,slotFrames,fps,tail=0){
  const start=spec.trimStartSec||0;
  const end=Math.min(source.durationSec,spec.trimEndSec??source.durationSec);
  if(end<=start)throw Error('Requested source trim is outside '+source.file);
  const rate=spec.playbackRate||1;
  // The additional tail is always a held frame, never previously unseen footage.
  const playFrames=Math.max(1,Math.min(slotFrames,Math.floor((end-start)*fps/rate+1e-6)));
  const holdFrames=slotFrames-playFrames+tail;
  const freezeSourceTime=Math.min(end-1/fps,Math.max(start,start+(playFrames-1)*rate/fps));
  return {
    file:source.file,playbackRate:rate,trimBefore:Math.round(start*fps),
    playFrames,holdFrames,freezeFrame:Math.max(0,Math.floor(freezeSourceTime*fps)),
    durationFrames:slotFrames+tail
  };
}

/**
 * sources = {'capture':{file:'footage/capture.mp4',durationSec:12.3},
 *            'asset:mobile':{file:'footage/mobile.mp4',durationSec:15}}
 * All URLs/paths are prepared by the trusted media adapter, never passed by agents.
 */
export function compileSceneEdit(scene,{sources,fps,voiceDurationSec=0,captions=[],captionsBurned=true,hasVoice=false}){
  validateSceneEdit(scene);
  finite(fps,1,120,'fps');finite(voiceDurationSec,0,900,'voiceDurationSec');
  if(!sources||!sources.capture)throw Error('Missing scene capture source');
  const targetSec=Math.max(scene.durationSec,hasVoice?voiceDurationSec+0.5:0);
  const targetFrames=frames(targetSec,fps);
  const edit=scene.edit||{};
  const defs=edit.shots||[{source:'capture',durationSec:scene.durationSec}];
  const slotFrames=defs.map(s=>frames(s.durationSec,fps));
  const used=slotFrames.reduce((a,b)=>a+b,0);
  if(used>targetFrames+1)throw Error('Scene shots exceed output frame count');
  const shots=[];let cursor=0;
  const ids=shotIds(scene);
  for(let i=0;i<defs.length;i++){
    const s=defs[i],key=sourceName(s.source),source=sources[key];
    if(!source)throw Error('Missing source for scene edit: '+key);
    const tail=i===defs.length-1?Math.max(0,targetFrames-used):0;
    if(edit.design&&s.trimEndSec!==undefined&&s.trimEndSec>source.durationSec+1/fps)throw Error('Designed shot trim exceeds actual source: '+ids[i]);
    const media=compileMedia(s,source,slotFrames[i],fps,tail);
    shots.push({...media,id:ids[i],fromFrame:cursor,zoom:s.zoom??1,focus:s.focus??{x:0.5,y:0.5},label:s.label||null,
      camera:s.camera||'pulse',transitionInFrames:s.transitionIn?frames(s.transitionIn.durationSec,fps):0,
      purpose:s.purpose||null,editReason:s.editReason||null});
    cursor+=media.durationFrames;
  }
  const insets=(edit.insets||[]).map(v=>{
    const source=sources['asset:'+v.asset];
    if(!source)throw Error('Missing inset asset: '+v.asset);
    const startFrame=Math.round(v.startSec*fps),durationFrames=frames(v.durationSec,fps);
    const media=compileMedia(v,source,durationFrames,fps);
    return {...media,fromFrame:startFrame,x:v.x,y:v.y,width:v.width,height:v.height,label:v.label||null};
  });
  const callouts=(edit.callouts||[]).map(c=>({text:c.text,
    fromFrame:Math.round(c.startSec*fps),durationFrames:frames(c.durationSec,fps),position:c.position||'top-right'}));
  return {
    fps,durationInFrames:targetFrames,hasVoice,chapter:edit.chapter||null,
    captionsBurned,shots,insets,callouts,captions,theme:edit.design?.theme||defaultVisualTheme
  };
}
