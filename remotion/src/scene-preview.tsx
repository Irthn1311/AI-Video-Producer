import React from 'react';
import {AbsoluteFill,Composition,Sequence,Freeze,Easing,interpolate,staticFile,registerRoot,useCurrentFrame,useVideoConfig} from 'remotion';
import {Video,Audio} from '@remotion/media';

type MediaShot={file:string;trimBefore:number;playFrames:number;holdFrames:number;freezeFrame:number;
  durationFrames:number;fromFrame:number;playbackRate:number;zoom?:number;focus?:{x:number;y:number};label?:string|null};
type Inset=MediaShot&{x:number;y:number;width:number;height:number};
type Callout={text:string;fromFrame:number;durationFrames:number;position:string};
type Caption={startMs:number;endMs:number;text:string};
type Plan={fps:number;durationInFrames:number;hasVoice:boolean;chapter:string|null;captionsBurned:boolean;
  shots:MediaShot[];insets:Inset[];callouts:Callout[];captions:Caption[]};
type Props={plan:Plan};
const empty:Plan={fps:30,durationInFrames:1,hasVoice:false,chapter:null,captionsBurned:true,shots:[],insets:[],callouts:[],captions:[]};
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;

const Media:React.FC<{shot:MediaShot}>=({shot})=><>
  <Sequence from={0} durationInFrames={shot.playFrames}>
    <Video src={staticFile(shot.file)} trimBefore={shot.trimBefore} playbackRate={shot.playbackRate}
      muted style={{height:'100%',width:'100%',objectFit:'contain'}}/>
  </Sequence>
  {shot.holdFrames>0?<Sequence from={shot.playFrames} durationInFrames={shot.holdFrames}>
    <Freeze frame={shot.freezeFrame}>
      <Video src={staticFile(shot.file)} muted style={{height:'100%',width:'100%',objectFit:'contain'}}/>
    </Freeze>
  </Sequence>:null}
</>;
const Camera:React.FC<{shot:MediaShot}>=({shot})=>{
  const frame=useCurrentFrame(),{fps}=useVideoConfig();
  const zoom=shot.zoom||1;
  const focus=shot.focus||{x:0.5,y:0.5};
  const last=Math.max(1,shot.durationFrames);
  const intro=Math.min(last/3,fps*1.2);
  const outro=Math.max(intro+1,last-intro);
  const scale=interpolate(frame,[0,intro,outro,last],[1,zoom,zoom,1],{...clamp,easing:Easing.inOut(Easing.cubic)});
  return <AbsoluteFill style={{background:'#f5faf7',overflow:'hidden'}}>
    <AbsoluteFill style={{transform:'scale('+scale+')',transformOrigin:(focus.x*100)+'% '+(focus.y*100)+'%'}}>
      <Media shot={shot}/>
    </AbsoluteFill>
  </AbsoluteFill>;
};
const CaptionLayer:React.FC<{captions:Caption[]}>=({captions})=>{
  const frame=useCurrentFrame(),{fps}=useVideoConfig();
  const ms=frame/fps*1000;
  const row=captions.find(c=>ms>=c.startMs&&ms<c.endMs);
  if(!row)return null;
  return <div style={{position:'absolute',left:'6%',right:'6%',bottom:'7%',display:'flex',justifyContent:'center',pointerEvents:'none'}}>
    <div style={{maxWidth:'90%',padding:'12px 22px',borderRadius:12,background:'rgba(3,31,25,.90)',
      color:'white',fontSize:32,fontWeight:600,lineHeight:1.4,textAlign:'center',whiteSpace:'pre-wrap'}}>{row.text}</div>
  </div>;
};
const Chapter:React.FC<{label:string}>=({label})=><div style={{
  position:'absolute',left:30,bottom:24,padding:'9px 15px',borderRadius:8,
  background:'rgba(5,51,40,.88)',color:'white',fontSize:20,fontWeight:600}}>{label}</div>;
const CalloutView:React.FC<{text:string;position:string}>=({text,position})=>{
  const style:React.CSSProperties={position:'absolute',padding:'10px 16px',borderRadius:10,
    background:'rgba(239,255,247,.96)',color:'#073e32',fontSize:25,fontWeight:600,maxWidth:'45%',
    border:'1px solid #bde7d5'};
  if(position.includes('top'))style.top=45;
  if(position.includes('bottom'))style.bottom=125;
  if(position.includes('left'))style.left=35;
  if(position.includes('right'))style.right=35;
  if(position==='center'){style.top='42%';style.left='30%';style.textAlign='center';}
  return <div style={style}>{text}</div>;
};
const InsetView:React.FC<{inset:Inset}>=({inset})=><AbsoluteFill style={{
  left:(inset.x*100)+'%',top:(inset.y*100)+'%',width:(inset.width*100)+'%',height:(inset.height*100)+'%',
  border:'4px solid #e8fff5',borderRadius:16,overflow:'hidden',boxShadow:'0 10px 30px #00291d55',
  background:'#ffffff'}}>
  {inset.label?<div style={{position:'absolute',left:0,right:0,top:0,height:35,zIndex:2,
    background:'#073e32',color:'white',fontSize:17,padding:'5px 10px'}}>{inset.label}</div>:null}
  <Media shot={inset}/>
</AbsoluteFill>;
const EditedScene:React.FC<Props>=({plan})=><AbsoluteFill style={{background:'#f5faf7',fontFamily:'Arial, sans-serif'}}>
  {plan.shots.map((shot,i)=><Sequence key={'shot-'+i} from={shot.fromFrame} durationInFrames={shot.durationFrames}>
    <Camera shot={shot}/>
    {shot.label?<Sequence durationInFrames={Math.min(shot.durationFrames,Math.round(plan.fps*3))}><Chapter label={shot.label}/></Sequence>:null}
    {shot.playbackRate>1.05?<div style={{position:'absolute',right:30,bottom:26,padding:8,borderRadius:8,
      color:'white',background:'#073e32cc',fontSize:18}}>Footage x{shot.playbackRate.toFixed(2)} (sped up)</div>:null}
  </Sequence>)}
  {plan.insets.map((inset,i)=><Sequence key={'inset-'+i} from={inset.fromFrame} durationInFrames={inset.durationFrames}><InsetView inset={inset}/></Sequence>)}
  {plan.callouts.map((callout,i)=><Sequence key={'callout-'+i} from={callout.fromFrame} durationInFrames={callout.durationFrames}><CalloutView text={callout.text} position={callout.position}/></Sequence>)}
  {plan.chapter?<Sequence durationInFrames={Math.min(plan.durationInFrames,Math.round(plan.fps*3))}><Chapter label={plan.chapter}/></Sequence>:null}
  {plan.hasVoice?<Audio src={staticFile('voice.wav')} volume={1}/>:null}
  {plan.captionsBurned?<CaptionLayer captions={plan.captions}/>:null}
</AbsoluteFill>;
const Root=()=> <Composition id="AVPEditedScene" component={EditedScene} defaultProps={{plan:empty}}
  calculateMetadata={({props})=>({fps:props.plan.fps,width:(props as Props & {width?:number}).width||1920,
    height:(props as Props & {height?:number}).height||1080,
    durationInFrames:Math.max(1,props.plan.durationInFrames)})}/>;
registerRoot(Root);
