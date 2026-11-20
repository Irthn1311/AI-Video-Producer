import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readJson,writeJson,sceneDir} from '../src/utils.mjs';

const repo=path.resolve(import.meta.dirname,'..');
const cli=(root,...args)=>spawnSync(process.execPath,[path.join(repo,'bin','avp.mjs'),...args,'--project',root],
  {encoding:'utf8',timeout:10000});
test('CLI snapshot, versions, restore confirmation and approval invalidation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-revision-cli-'));
  try{
    const config=readJson(path.join(repo,'templates/project.json'));
    fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app','index.js'),'x');
    config.sourcePath='app';writeJson(path.join(root,'project.json'),config);
    const scene=config.scenes[0],dir=sceneDir(root,scene.id);fs.mkdirSync(dir,{recursive:true});
    const clip=path.join(dir,'capture.mp4');fs.writeFileSync(clip,'v1 fixture content');
    const saved=cli(root,'snapshot','--scene',scene.id,'--label','first');
    assert.equal(saved.status,0,saved.stderr);
    assert.equal(JSON.parse(saved.stdout).version,'v0001');
    const versions=cli(root,'versions','--scene',scene.id);
    assert.equal(versions.status,0,versions.stderr);
    assert.equal(JSON.parse(versions.stdout).versions.length,1);
    fs.writeFileSync(clip,'v2 fixture content');
    const noConfirm=cli(root,'restore','--scene',scene.id,'--version','v0001');
    assert.notEqual(noConfirm.status,0);
    assert.equal(fs.readFileSync(clip,'utf8'),'v2 fixture content');
    const ok=cli(root,'restore','--scene',scene.id,'--version','v0001','--confirm');
    assert.equal(ok.status,0,ok.stderr);
    const outcome=JSON.parse(ok.stdout);
    assert.equal(outcome.approvalRestored,false);
    assert.equal(outcome.preRestoreBackup,'v0002');
    assert.equal(fs.readFileSync(clip,'utf8'),'v1 fixture content');
    assert.equal(JSON.parse(cli(root,'versions','--scene',scene.id).stdout).versions.length,2);
    const out=JSON.parse(cli(root,'status').stdout);
    assert.equal(out.scenes[0].approved,false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
