import test from 'node:test';import assert from 'node:assert/strict';import {makeProject,setTrim,setResolution,setAspect,formatTime} from '../src/model.js';
test('V13 source trim leaves timeline placement unchanged',()=>{const p=makeProject({name:'a.mp4'},{duration:10,width:1920,height:1080});setTrim(p,2,8,10);assert.equal(p.clips[0].at,0);assert.equal(p.clips[0].outP-p.clips[0].inP,6);assert.equal(p.proj.w,1280);});
test('portrait stays portrait',()=>{const p=makeProject({name:'p.mov'},{duration:10,width:1080,height:1920});assert.equal(p.proj.w,720);assert.equal(p.proj.h,1280);});
test('reject invalid trim without changing project',()=>{const p=makeProject({name:'a.mp4'},{duration:10,width:1920,height:1080});const before=JSON.stringify(p);for(const [a,b] of [[-1,4],[5,5],[9,8],[0,11],[NaN,4],[1,Infinity]])assert.throws(()=>setTrim(p,a,b,10));assert.equal(JSON.stringify(p),before);});


test('resolution change preserves edits and round-trips portrait size',()=>{
 const p=makeProject({name:'p.mov'},{duration:12,width:1080,height:1920});
 setTrim(p,2,8,12);p.proj.futureField='keep';const before=JSON.stringify(p.clips);
 setResolution(p,1080);assert.equal(p.proj.w,1080);assert.equal(p.proj.h,1920);assert.equal(p.proj.bitrate,8);
 assert.equal(JSON.stringify(p.clips),before);assert.equal(p.proj.futureField,'keep');
 setResolution(p,720);assert.equal(p.proj.w,720);assert.equal(p.proj.h,1280);assert.equal(p.proj.bitrate,4);
 const snap=JSON.stringify(p);assert.throws(()=>setResolution(p,2160));assert.equal(JSON.stringify(p),snap);
});

test('manual orientation and quality compose without changing source edits',()=>{
 const p=makeProject({name:'source.mp4'},{duration:10,width:1920,height:1080});
 setTrim(p,1,6,10);const clips=JSON.stringify(p.clips);
 setAspect(p,'9:16');assert.deepEqual([p.proj.w,p.proj.h],[720,1280]);
 setResolution(p,1080);assert.deepEqual([p.proj.w,p.proj.h],[1080,1920]);
 setAspect(p,'16:9');assert.deepEqual([p.proj.w,p.proj.h],[1920,1080]);
 assert.equal(p.proj.aspect,'16:9');assert.equal(p.proj.bitrate,8);assert.equal(JSON.stringify(p.clips),clips);
 const snap=JSON.stringify(p);assert.throws(()=>setAspect(p,'1:1'));assert.equal(JSON.stringify(p),snap);
});

test('time display carries tenths into minutes without 00:60.0',()=>{
 assert.equal(formatTime(59.96),'01:00.0');assert.equal(formatTime(59.94),'00:59.9');
 assert.equal(formatTime(119.96),'02:00.0');assert.equal(formatTime(-1),'00:00.0');
 assert.equal(formatTime(Infinity),'00:00.0');assert.equal(formatTime(NaN),'00:00.0');
});
