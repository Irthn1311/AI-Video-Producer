import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readJson,writeJson} from '../src/utils.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ffmpeg=spawnSync('ffmpeg',['-version'],{encoding:'utf8'});
const ffprobe=spawnSync('ffprobe',['-version'],{encoding:'utf8'});
function execute(cmd,args,options={}){const result=spawnSync(cmd,args,{encoding:'utf8',timeout:90_000,...options});if(result.status!==0)throw Error(`${cmd} ${args.join(' ')} failed: ${result.stderr||result.stdout}`);return result.stdout;}

test('technical scene lifecycle: attach → captions → preview → QA → approval → final MP4',{
  skip:!!ffmpeg.error||!!ffprobe.error,timeout:120_000
},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'avp-smoke-'));
  try{
    const root=path.join(dir,'project');fs.mkdirSync(root);
    fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app','page.tsx'),'export const Page = 1;');
    const config=readJson(path.join(repo,'templates','project.json'));
    config.sourcePath='app';config.review.mode='review';config.voiceover.enabled=false;config.render={engine:'ffmpeg',width:320,height:180,fps:24,captionsBurned:false};config.scenes=[{...config.scenes[0],durationSec:2}];
    writeJson(path.join(root,'project.json'),config);
    const cli=(...args)=>execute('node',[path.join(repo,'bin','avp.mjs'),...args,'--project',root]);
    cli('plan');cli('approve','--stage','coverage');cli('approve','--stage','storyboard');
    const footage=path.join(dir,'source.mp4');
    execute('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=24:d=2','-c:v','libx264','-pix_fmt','yuv420p',footage]);
    cli('attach','--scene',config.scenes[0].id,'--file',footage);
    cli('captions','--scene',config.scenes[0].id);cli('preview','--scene',config.scenes[0].id);
    const qa=JSON.parse(cli('qa','--scene',config.scenes[0].id));assert.equal(qa.pass,true);
    cli('approve','--stage','scene','--scene',config.scenes[0].id);
    const result=JSON.parse(cli('render'));assert.equal(result.pass,true);
    cli('approve','--stage','final');
    assert.ok(fs.statSync(path.join(root,'.avp','output','final.mp4')).size>1000);
    const output=JSON.parse(cli('status'));assert.ok(output.reviews.final.approvedAt);
    // A source change invalidates the locked capture and blocks render.
    fs.writeFileSync(path.join(root,'app','page.tsx'),'export const Page = 2;');
    const refused=spawnSync('node',[path.join(repo,'bin','avp.mjs'),'render','--project',root],{encoding:'utf8'});
    assert.notEqual(refused.status,0);assert.match(refused.stderr,/stale/i);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
