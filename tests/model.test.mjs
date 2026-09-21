import test from 'node:test';import assert from 'node:assert/strict';import {makeProject,setTrim} from '../src/model.js';
test('V13 source trim leaves timeline placement unchanged',()=>{const p=makeProject({name:'a.mp4'},{duration:10,width:1920,height:1080});setTrim(p,2,8,10);assert.equal(p.clips[0].at,0);assert.equal(p.clips[0].outP-p.clips[0].inP,6);assert.equal(p.proj.w,1280);});
test('portrait stays portrait',()=>{const p=makeProject({name:'p.mov'},{duration:10,width:1080,height:1920});assert.equal(p.proj.w,720);assert.equal(p.proj.h,1280);});
test('reject invalid trim without changing project',()=>{const p=makeProject({name:'a.mp4'},{duration:10,width:1920,height:1080});const before=JSON.stringify(p);for(const [a,b] of [[-1,4],[5,5],[9,8],[0,11],[NaN,4],[1,Infinity]])assert.throws(()=>setTrim(p,a,b,10));assert.equal(JSON.stringify(p),before);});

