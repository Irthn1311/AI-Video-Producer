import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, '.agents', 'skills');
const core = ['video-producer','repo-intelligence','feature-coverage','storyboard-planner','browser-capture','scene-director','ai-voiceover','video-editing','production-optimizer','video-qa'];
const remotion = ['avp-remotion-workflow','avp-remotion-create','avp-remotion-markup','avp-remotion-captions','avp-remotion-studio','avp-remotion-render','avp-remotion-docs'];

test('every bundled core and Remotion skill has matching frontmatter', () => {
  for (const name of [...core, ...remotion, 'graphify']) {
    const file = path.join(dir, name, 'SKILL.md');
    assert.ok(fs.existsSync(file), name + ' is missing');
    const data = fs.readFileSync(file, 'utf8');
    assert.match(data, /^---\r?\nname: [a-z0-9-]+\r?\n/);
    assert.ok(data.includes('name: ' + name + '\n'), name + ' metadata mismatch');
    assert.match(data, /description: .+/);
  }
});

test('Graphify attribution and eight supporting references are included', () => {
  for (const file of ['LICENSE','LICENSE-MIT','NOTICE','UPSTREAM.md',
    'references/add-watch.md','references/exports.md','references/extraction-spec.md',
    'references/github-and-merge.md','references/hooks.md','references/query.md',
    'references/transcribe.md','references/update.md']) {
    assert.ok(fs.existsSync(path.join(dir,'graphify',file)), 'graphify/' + file + ' is missing');
  }
});

test('public skill docs link to the shipped skill directory', () => {
  const doc = fs.readFileSync(path.join(root,'docs','skills.md'),'utf8');
  for(const name of [...core,...remotion]) assert.ok(doc.includes('../.agents/skills/' + name + '/SKILL.md'), name + ' missing from docs');
  assert.ok(fs.existsSync(path.join(root,'docs','third-party-skills.md')));
});
