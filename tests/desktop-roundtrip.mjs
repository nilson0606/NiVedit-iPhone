// Optional local-only evidence. Reads a user's V13 project; never publishes its bytes.
import fs from 'node:fs/promises';import {openAsBlob} from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {readProject,writeProject} from '../src/project-file.js';import {trimClip} from '../src/model.js';
const path=process.argv[2];if(!path)throw Error('Pass a local V13 .nvproj');
const raw=await openAsBlob(path),value=await readProject(raw),expected=structuredClone(value.project);
const c=value.project.clips.find(c=>c.outP-c.inP>1);trimClip(value.project,c.id,c.inP+.1,c.outP,c.dur||c.outP);expected.clips.find(x=>x.id===c.id).inP+=.1;
assert.deepEqual(value.project,expected);
const output=writeProject(value.project,value.media,value.name,value.header),back=await readProject(output);assert.deepEqual(back.project,expected);
let count=0;for(const[key,blob]of value.media){
 const hash=async b=>{const h=crypto.createHash('sha256');for await(const chunk of b.stream())h.update(chunk);return h.digest('hex');};
 assert.equal(await hash(blob),await hash(back.media.get(key)));count++;
}
const report={sourceVersion:value.header.ver,clipCount:value.project.clips.length,assetCount:count,bytes:raw.size,onlyEdit:'first eligible source inP +0.1',statePreserved:true,assetHashesPreserved:true};
await fs.writeFile('qa/desktop-roundtrip.json',JSON.stringify(report,null,2));console.log(report);
