import React from 'react';
import {AbsoluteFill,Composition,Sequence,Freeze,Easing,interpolate,staticFile,registerRoot,useCurrentFrame,useVideoConfig} from 'remotion';
import {Video,Audio} from '@remotion/media';

type Theme={background:string;panel:string;text:string;accent:string};
const defaultTheme:Theme={background:'#f5faf7',panel:'#073e32',text:'#ffffff',accent:'#bde7d5'};
type MediaShot={id?:string;camera?:string;transitionInFrames?:number;file:string;trimBefore:number;playFrames:number;holdFrames:number;freezeFrame:number;
  durationFrames:number;fromFrame:number;playbackRate:number;zoom?:number;focus?:{x:number;y:number};label?:string|null};
type Inset=MediaShot&{x:number;y:number;width:number;height:number};
type Callout={text:string;fromFrame:number;durationFrames:number;position:string};
type Caption={startMs:number;endMs:number;text:string};
type Plan={fps:number;durationInFrames:number;hasVoice:boolean;chapter:string|null;captionsBurned:boolean;
  shots:MediaShot[];insets:Inset[];callouts:Callout[];captions:Caption[];theme?:Theme};
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
const Camera:React.FC<{shot:MediaShot;theme:Theme}>=({shot,theme})=>{
  const frame=useCurrentFrame(),{fps}=useVideoConfig();
  const zoom=shot.zoom||1;
  const focus=shot.focus||{x:0.5,y:0.5};
  const last=Math.max(1,shot.durationFrames);
  const intro=Math.min(last/3,fps*1.2);
  const outro=Math.max(intro+1,last-intro);
  const ease={...clamp,easing:Easing.inOut(Easing.cubic)};
  const scale=shot.camera==='static'?1:shot.camera==='hold'?zoom:shot.camera==='push'?
    interpolate(frame,[0,Math.max(1,last-1)],[1,zoom],ease):
    last<3?zoom:interpolate(frame,[0,intro,outro,last],[1,zoom,zoom,1],ease);
  const opacity=shot.transitionInFrames?interpolate(frame,[0,shot.transitionInFrames],[0,1],clamp):1;
  return <AbsoluteFill style={{background:theme.background,overflow:'hidden'}}>
    <AbsoluteFill style={{opacity,transform:'scale('+scale+')',transformOrigin:(focus.x*100)+'% '+(focus.y*100)+'%'}}>
      <Media shot={shot}/>
    </AbsoluteFill>
  </AbsoluteFill>;
};
const CaptionLayer:React.FC<{captions:Caption[];theme:Theme}>=({captions,theme})=>{
  const frame=useCurrentFrame(),{fps,width,height}=useVideoConfig();
  const fontSize=Math.max(12,Math.min(width*.035,height*.045));
  const ms=frame/fps*1000;
  const row=captions.find(c=>ms>=c.startMs&&ms<c.endMs);
  if(!row)return null;
  return <div style={{position:'absolute',left:'6%',right:'6%',bottom:'7%',display:'flex',justifyContent:'center',pointerEvents:'none'}}>
    <div style={{maxWidth:'94%',padding:`${Math.max(4,fontSize*.35)}px ${Math.max(8,fontSize*.65)}px`,borderRadius:Math.max(5,fontSize*.35),background:theme.panel,
      color:theme.text,fontSize,fontWeight:600,lineHeight:1.4,textAlign:'center',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.text}</div>
  </div>;
};
const Chapter:React.FC<{label:string;theme:Theme}>=({label,theme})=><div style={{
  position:'absolute',left:30,bottom:24,padding:'9px 15px',borderRadius:8,
  background:theme.panel,color:theme.text,fontSize:20,fontWeight:600}}>{label}</div>;
const CalloutView:React.FC<{text:string;position:string;theme:Theme}>=({text,position,theme})=>{
  const style:React.CSSProperties={position:'absolute',padding:'10px 16px',borderRadius:10,
    background:theme.panel,color:theme.text,fontSize:25,fontWeight:600,maxWidth:'45%',
    border:'1px solid '+theme.accent};
  if(position.includes('top'))style.top=45;
  if(position.includes('bottom'))style.bottom=125;
  if(position.includes('left'))style.left=35;
  if(position.includes('right'))style.right=35;
  if(position==='center'){style.top='42%';style.left='30%';style.textAlign='center';}
  return <div style={style}>{text}</div>;
};
const InsetView:React.FC<{inset:Inset;theme:Theme}>=({inset,theme})=><AbsoluteFill style={{
  left:(inset.x*100)+'%',top:(inset.y*100)+'%',width:(inset.width*100)+'%',height:(inset.height*100)+'%',
  border:'4px solid '+theme.accent,borderRadius:16,overflow:'hidden',boxShadow:'0 10px 30px #00291d55',
  background:'#ffffff'}}>
  {inset.label?<div style={{position:'absolute',left:0,right:0,top:0,height:35,zIndex:2,
    background:theme.panel,color:theme.text,fontSize:17,padding:'5px 10px'}}>{inset.label}</div>:null}
  <Media shot={inset}/>
</AbsoluteFill>;
const EditedScene:React.FC<Props>=({plan})=>{const theme=plan.theme||defaultTheme;return <AbsoluteFill style={{background:theme.background,fontFamily:'Arial, sans-serif'}}>
  {plan.shots.map((shot,i)=><Sequence key={shot.id||'shot-'+i} from={shot.fromFrame} durationInFrames={shot.durationFrames}>
    <Camera shot={shot} theme={theme}/>
    {shot.label?<Sequence durationInFrames={Math.min(shot.durationFrames,Math.round(plan.fps*3))}><Chapter label={shot.label} theme={theme}/></Sequence>:null}
    {shot.playbackRate>1.05?<div style={{position:'absolute',right:30,bottom:26,padding:8,borderRadius:8,
      color:theme.text,background:theme.panel,fontSize:18}}>Footage x{shot.playbackRate.toFixed(2)} (sped up)</div>:null}
  </Sequence>)}
  {plan.insets.map((inset,i)=><Sequence key={'inset-'+i} from={inset.fromFrame} durationInFrames={inset.durationFrames}><InsetView inset={inset} theme={theme}/></Sequence>)}
  {plan.callouts.map((callout,i)=><Sequence key={'callout-'+i} from={callout.fromFrame} durationInFrames={callout.durationFrames}><CalloutView text={callout.text} position={callout.position} theme={theme}/></Sequence>)}
  {plan.chapter?<Sequence durationInFrames={Math.min(plan.durationInFrames,Math.round(plan.fps*3))}><Chapter label={plan.chapter} theme={theme}/></Sequence>:null}
  {plan.hasVoice?<Audio src={staticFile('voice.wav')} volume={1}/>:null}
  {plan.captionsBurned?<CaptionLayer captions={plan.captions} theme={theme}/>:null}
</AbsoluteFill>;};
const Root=()=> <Composition id="AVPEditedScene" component={EditedScene} defaultProps={{plan:empty}}
  calculateMetadata={({props})=>({fps:props.plan.fps,width:(props as Props & {width?:number}).width||1920,
    height:(props as Props & {height?:number}).height||1080,
    durationInFrames:Math.max(1,props.plan.durationInFrames)})}/>;
registerRoot(Root);
