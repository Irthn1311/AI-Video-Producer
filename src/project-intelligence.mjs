import fs from 'node:fs';
import path from 'node:path';
import {scanSource} from './inspect.mjs';
import {avpDir,sha,writeJson} from './utils.mjs';

// Static analysis of untrusted repos: never execute npm scripts, import project
// code, access .env/secret files, fetch remote URLs or emit raw source text.
const schemaVersion=1;
const maxSourceFiles=320;
const maxSourceBytes=3_000_000;
const signalLimit=5;
const isCode=p=>/\.(?:js|jsx|mjs|cjs|ts|tsx|py|go|rs|java|html|vue|svelte)$/i.test(p);
const isTest=p=>/(?:^|\/)(?:tests?|__tests__|spec|fixtures?)(?:\/|$)|\.(?:spec|test)\./i.test(p);
const isManifest=p=>/(^|\/)(?:package\.json|pyproject\.toml|requirements(?:-[\w-]+)?\.txt|Cargo\.toml|go\.mod|pom\.xml)$/i.test(p);
const cleanRoute=s=>{
  if(typeof s!=='string'||s.length>160||!/^\//.test(s)||/[\s<>\\]/.test(s))return null;
  return s.replace(/\/{2,}/g,'/');
};
const uniqBy=(items,key)=>[...new Map(items.map(v=>[key(v),v])).values()];
const sorted=(a,b)=>a.path.localeCompare(b.path,'en');
function keyFile(f){
  if(isManifest(f.path))return 0;
  if(isCode(f.path)&&!isTest(f.path))return 1;
  if(isTest(f.path))return 2;
  return 3;
}
const techRules=[
  ['nextjs',/(?:^|\/)next\.config\.[^/]+$|(?:^|\/)(?:app|pages)\/.*(?:page|layout)\.[jt]sx?$/i,/(^|\/)next$/],
  ['react',/\.[jt]sx$/i,/(^|\/)(react|react-dom)$/],
  ['vue',/\.vue$/i,/(^|\/)vue$/],
  ['svelte',/\.svelte$/i,/(^|\/)(svelte|@sveltejs\/kit)$/],
  ['vite',/(?:^|\/)vite\.config\.[^/]+$/i,/(^|\/)vite$/],
  ['express',/^\0$/,/(^|\/)express$/],
  ['fastapi',/^\0$/,/(^|\/)fastapi$/],
  ['flask',/^\0$/,/(^|\/)flask$/],
  ['django',/(?:^|\/)(?:manage|settings|urls)\.py$/i,/(^|\/)django$/],
  ['rust',/\.rs$/i,/(^|\/)cargo$/],
  ['go',/\.go$/i,/(^|\/)go$/]
];
const signals=[
  {id:'canvas-interaction',needs:['pointer-interaction','canvas-assertions'],
    pattern:/\bgetContext\s*\(|<canvas\b|\b(?:pointerdown|pointermove|touchstart|touchmove)\b/ig,
    detail:'Canvas/pointer references; handwriting functionality is NOT established'},
  {id:'multi-device-pairing',needs:['multi-context-browser','session-state-assertions'],
    pattern:/\b(?:pairingCode|pairDevice|devicePairing|pairing[_-]code|qrcode|QR\s*code)\b/ig,
    detail:'Device/pairing reference, not a verified two-device workflow'},
  {id:'realtime-events',needs:['websocket-observation','state-synchronization'],
    pattern:/(?:\bnew\s+WebSocket\s*\(|\bWebSocketServer\b|\bsocket\.io\b|\bnew\s+EventSource\s*\(|@app\.websocket\b|\bwebsocket_endpoint\b)/ig,
    detail:'Realtime communication reference'},
  {id:'streaming-response',needs:['streaming-assertions','timed-capture'],
    pattern:/(?:\bReadableStream\s*\(|\bStreamingResponse\s*\(|text\/event-stream|\bstreamText\s*\()/ig,
    detail:'Streaming response reference'},
  {id:'maps-geolocation',needs:['map-interaction','geolocation-test-context'],
    pattern:/(?:\bmapboxgl\b|\bL\.map\s*\(|\bgoogle\.maps\b|\bnavigator\.geolocation\b|\bMapContainer\b)/ig,
    detail:'Map or location API reference'},
  {id:'charts-dashboard',needs:['chart-interaction','data-assertions'],
    pattern:/(?:\brecharts\b|\b[Cc]hart\.js\b|\bplotly\b|\bnew\s+Chart\s*\(|\bResponsiveContainer\b)/ig,
    detail:'Chart library/component reference'},
  {id:'webgl-3d',needs:['webgl-capture','gpu-readiness'],
    pattern:/(?:\bgetContext\s*\(\s*['"]webgl2?['"]|\bTHREE\.Scene\b|@react-three\/fiber\b|\bbabylonjs\b)/ig,
    detail:'WebGL/3D API reference'},
  {id:'media-capture',needs:['device-permissions','media-fixture'],
    pattern:/(?:\bgetUserMedia\s*\(|\bmediaDevices\b|\bRTCPeerConnection\b)/ig,
    detail:'Camera/microphone/WebRTC reference'},
  {id:'file-uploads',needs:['upload-fixture','file-verification'],
    pattern:/(?:<input[^>]*type=['"]file['"]|multipart\/form-data|\bUploadFile\b)/ig,
    detail:'File upload reference'},
  {id:'checkout-payments',needs:['sandbox-checkout','transaction-safety-review'],
    pattern:/(?:\bstripe\.checkout\b|\bcheckout\.sessions\.create\b|\bcreatePaymentIntent\b|\bpayment_intents\.create\b)/ig,
    detail:'Payment integration reference; NEVER use real payment data'}
];
function extractPkg(text){
  try{
    const value=JSON.parse(text);
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    return {dependencies:Object.keys({...value.dependencies,...value.devDependencies,
      ...value.optionalDependencies}).filter(x=>x.length<=100).sort(),
      scripts:Object.keys(value.scripts||{}).filter(x=>/^[a-zA-Z][a-zA-Z0-9:_-]{0,60}$/.test(x)).sort()};
  }catch{return null;}
}
function detectPathRoute(p){
  const parts=p.replace(/\\/g,'/').split('/');
  const entry=parts[0]==='src'?parts.slice(1):parts;
  if(entry[0]==='app'&&/^page\.[jt]sx?$/.test(entry.at(-1)||'')){
    const segments=entry.slice(1,-1).filter(x=>!x.startsWith('(')&&!x.startsWith('@'));
    return cleanRoute('/'+segments.join('/'));
  }
  if(entry[0]==='pages'&&/\.[jt]sx?$/.test(entry.at(-1)||'')&&!/^_(?:app|document|error)\./.test(entry.at(-1))){
    const segments=entry.slice(1);
    segments[segments.length-1]=segments.at(-1).replace(/\.[jt]sx?$/,'');
    if(segments.at(-1)==='index')segments.pop();
    return cleanRoute('/'+segments.join('/'));
  }
  if(entry[0]==='routes'&&/^\+page\.(?:svelte|js|ts)$/.test(entry.at(-1)||'')){
    return cleanRoute('/'+entry.slice(1,-1).filter(x=>!x.startsWith('(')).join('/'));
  }
  return null;
}
function collectRoutes(text,p){
  const found=[];
  const pathname=detectPathRoute(p);
  if(pathname!==null)found.push({path:pathname,kind:'file-route',method:'GET',evidence:{path:p,kind:'filename'}});
  const methods=/(?:@?(?:app|router|api|server)\.(get|post|put|patch|delete))\s*\(\s*['"]([^'"]+)['"]/g;
  for(let m; (m=methods.exec(text));){
    const route=cleanRoute(m[2]);
    if(route!==null){
      const line=text.slice(0,m.index).split('\n').length;
      found.push({path:route,kind:'code-route',method:m[1].toUpperCase(),evidence:{path:p,line,kind:'static-code'}});
    }
    if(found.length>=50)break;
  }
  const routers=/(?:path|to)\s*[:=]\s*['"](\/[^'"]+)['"]/g;
  if(/\.[jt]sx?$|\.vue$|\.svelte$/.test(p)){
    for(let m;(m=routers.exec(text));){
      const route=cleanRoute(m[1]);if(route!==null)
        found.push({path:route,kind:'router-reference',method:'NAVIGATE',
          evidence:{path:p,line:text.slice(0,m.index).split('\n').length,kind:'static-code'}});
      if(found.length>=75)break;
    }
  }
  return found;
}
function entrypointCandidates(files,manifests){
  const paths=files.map(x=>x.path);
  const result=[];
  for(const f of paths){
    if(/(?:^|\/)(?:server|main|app|index)\.(?:m?js|cjs|ts|py|go|rs)$/i.test(f)||
       /(?:^|\/)(?:manage\.py|Dockerfile|vite\.config\.[jt]s|next\.config\.[jt]s)$/i.test(f))
      result.push({path:f,kind:'entrypoint-candidate',verified:false});
  }
  for(const m of manifests){
    for(const script of m.scripts||[])
      if(/^(?:start|dev|serve|preview|test|build)$/i.test(script))
        result.push({path:m.path,kind:'script-name-only',script,verified:false});
  }
  return result.slice(0,40);
}
export function analyzeProject(root,config,{maxFiles=maxSourceFiles,maxBytes=maxSourceBytes}={}){
  const scan=scanSource(root,config),source=scan.source;
  if(!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>10000||
     !Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>100_000_000)
    throw Error('Invalid bounded project analysis limits');
  const selected=[...scan.files].sort((a,b)=>keyFile(a)-keyFile(b)||sorted(a,b));
  let bytes=0;
  const visited=[],manifests=[],techEvidence=new Map(),routes=[],capabilityEvidence=new Map(),errors=[];
  for(const f of selected){
    if(visited.length>=maxFiles||bytes+f.bytes>maxBytes)continue;
    // Only read files previously accepted by scanSource; never follow symlinks.
    const full=path.join(source,f.path);
    if(!fs.existsSync(full)||!fs.lstatSync(full).isFile()||fs.lstatSync(full).isSymbolicLink())continue;
    let text;
    try{text=fs.readFileSync(full,'utf8');}catch{errors.push({path:f.path,reason:'FILE_UNREADABLE'});continue;}
    bytes+=Buffer.byteLength(text,'utf8');
    visited.push(f);
    if(isManifest(f.path)){
      if(/(?:^|\/)package\.json$/i.test(f.path)){
        const parsed=extractPkg(text);
        if(!parsed){errors.push({path:f.path,reason:'INVALID_PACKAGE_MANIFEST'});continue;}
        manifests.push({path:f.path,...parsed});
      }else if(/requirements[^/]*\.txt$|pyproject\.toml$/i.test(f.path)){
        // Parse only non-executable dependency name markers, never values/secrets.
        const dependencyNames=[...text.matchAll(/(?:^|\n)\s*([a-zA-Z][a-zA-Z0-9_.-]{1,60})\s*(?:[=<>~!]=|[=<>~!])/g)]
          .map(m=>m[1].toLowerCase()).slice(0,100);
        manifests.push({path:f.path,dependencies:[...new Set(dependencyNames)].sort(),scripts:[]});
      }else manifests.push({path:f.path,dependencies:[],scripts:[]});
    }
    if(isCode(f.path)&&!isTest(f.path)){
      for(const item of collectRoutes(text,f.path))routes.push(item);
      for(const signal of signals){
        signal.pattern.lastIndex=0;
        const matches=[...text.matchAll(signal.pattern)].slice(0,signalLimit);
        if(!matches.length)continue;
        const ev=capabilityEvidence.get(signal.id)||[];
        for(const m of matches){
          if(ev.length>=signalLimit)break;
          const line=text.slice(0,m.index).split('\n').length;
          if(!ev.some(x=>x.path===f.path&&x.line===line))
            ev.push({path:f.path,line,kind:'static-code'});
        }
        capabilityEvidence.set(signal.id,ev);
      }
    }
  }
  const dependencies=new Set(manifests.flatMap(m=>m.dependencies||[]));
  const tech=[];
  for(const [id,pattern,dependency] of techRules){
    const refs=visited.filter(v=>pattern.test(v.path)).slice(0,4).map(v=>({path:v.path,kind:'filename'}));
    const deps=[...dependencies].filter(x=>dependency.test('/'+x)).slice(0,4);
    if(refs.length||deps.length)tech.push({id,confidence:'SOURCE_SIGNAL',
      evidence:refs,dependencies:deps});
  }
  for(const [id,ext] of [['python',/\.py$/i],['nodejs',/\.(?:m?js|cjs|jsx|ts|tsx)$/i]]){
    const f=visited.find(v=>ext.test(v.path));if(f&&!tech.some(x=>x.id===id))
      tech.push({id,confidence:'LANGUAGE_FILE',evidence:[{path:f.path,kind:'filename'}],dependencies:[]});
  }
  const capabilities=signals.filter(s=>capabilityEvidence.get(s.id)?.length).map(s=>({
    id:s.id,confidence:'CODE_REFERENCE_UNVERIFIED',neededCapabilities:s.needs,
    evidence:capabilityEvidence.get(s.id),warning:s.detail,
    runtimeVerified:false
  }));
  const uniqueRoutes=uniqBy(routes,(v)=>v.path+'|'+v.method+'|'+v.kind)
    .sort((a,b)=>a.path.localeCompare(b.path,'en')||a.method.localeCompare(b.method,'en')).slice(0,120);
  const report={
    schemaVersion,sourceFingerprint:scan.contentFingerprint,analysisLevel:'BOUNDED_STATIC_REPO_DISCOVERY',
    sourcePath:config.sourcePath||'.',scanned:{totalEligibleFiles:scan.files.length,
      inspectedFiles:visited.length,inspectedBytes:bytes,
      truncated:visited.length<scan.files.length,skippedBySourceScan:scan.skipped},
    technology:tech,runtime:{verified:false,
      launchCandidates:entrypointCandidates(visited,manifests),
      appUrlConfigured:typeof config.appUrl==='string'&&config.appUrl.length>0,
      authRequirements:'UNKNOWN',testDataReadiness:'UNKNOWN'},
    routes:uniqueRoutes,capabilitySignals:capabilities,
    analysisErrors:errors.slice(0,30),
    limitations:[
      'STATIC SIGNALS ONLY. Feature behavior, code reachability and route availability are not verified',
      'Manifest scripts are reported as names only; project code and scripts are NEVER executed',
      'No third-party skill search, untrusted adapter installation, external network calls or LLM usage',
      'No raw source snippets, .env contents, credentials or API response bodies in this report',
      'Runtime evidence must come from separate authorized rehearsal and production capture'
    ]
  };
  return report;
}
export function inspectProject(root,config){
  const report=analyzeProject(root,config);
  writeJson(path.join(avpDir(root),'intelligence','project-analysis.json'),report);
  return report;
}
