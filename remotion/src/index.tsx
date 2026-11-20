import React from 'react';
import {Composition,AbsoluteFill,Sequence,staticFile,registerRoot} from 'remotion';
import {Video} from '@remotion/media';

type Scene = {id:string; from:number; duration:number; file:string};
type Timeline = {width:number;height:number;fps:number;total:number;scenes:Scene[]};
const defaults:Timeline={width:1920,height:1080,fps:30,total:1,scenes:[]};
const Demo:React.FC<{timeline:Timeline}>=({timeline})=><AbsoluteFill style={{backgroundColor:'#000'}}>{timeline.scenes.map(scene=><Sequence key={scene.id} from={Math.round(scene.from*timeline.fps)} durationInFrames={Math.max(1,Math.round(scene.duration*timeline.fps))}><Video src={staticFile(scene.file)} style={{width:'100%',height:'100%',objectFit:'contain'}}/></Sequence>)}</AbsoluteFill>;
const Root=()=> <Composition id="AVPVideo" component={Demo} defaultProps={{timeline:defaults}} calculateMetadata={({props})=>({fps:props.timeline.fps,width:props.timeline.width,height:props.timeline.height,durationInFrames:Math.max(1,Math.round(props.timeline.total*props.timeline.fps))})}/>;
registerRoot(Root);
