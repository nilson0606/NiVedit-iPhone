import test from 'node:test';import assert from 'node:assert/strict';import {readProject,writeProject} from '../src/project-file.js';import {makeProject,addClip,layout,activeLayers,moveClip,trimClip,splitClip,totalDuration} from '../src/model.js';
const source=new File([new Uint8Array([5,4,3,2,1])],'source.mp4',{type:'video/mp4'}),meta={duration:10,width:1280,height:720};
function fixture(){const p=makeProject(source,meta);p.clips=[];const a=addClip(p,source,meta),b=addClip(p,source,meta);return {p,a,b};}
test('video gap/move/collision and split preserve source phase',()=>{
 const {p,a,b}=fixture();moveClip(p,b.id,12,0);assert.equal(totalDuration(p),22);
 assert.throws(()=>moveClip(p,b.id,3,0),/TRACK_OVERLAP/);assert.equal(b.at,12);
 moveClip(p,b.id,3,1);const second=splitClip(p,b.id,7);assert.equal(second.inP,4);assert.equal(second.at,7);assert.equal(second.mediaKey,b.mediaKey);
 assert.equal(layout(p).find(q=>q.clip===second).end,13);
});
test('shortening leaves next clip pinned; extending into next is rejected',()=>{
 const {p,a,b}=fixture();trimClip(p,a.id,1,7,10);assert.equal(b.at,10);assert.equal(layout(p)[0].end,6);
 moveClip(p,b.id,7,0);assert.throws(()=>trimClip(p,a.id,0,10,10),/TRACK_OVERLAP/);
});
test('image overlap is stable by start then array order, ending reveals older',()=>{
 const {p}=fixture();const im={duration:5,width:100,height:100,kind:'image'},a=addClip(p,source,im),b=addClip(p,source,im);
 a.at=1;b.at=2;b.outP=1;assert.deepEqual(activeLayers(p,2.5).filter(q=>q.track===2).map(q=>q.clip.id),[a.id,b.id]);
 assert.deepEqual(activeLayers(p,3.5).filter(q=>q.track===2).map(q=>q.clip.id),[a.id]);
});
test('NVPROJ1 preserves unknown state/header/index fields and exact asset bytes',async()=>{
 const {p,a,b}=fixture();p.future={a:[null,{s:'原始值'}]};p.titles=[{id:'title',text:'keep',future:3}];p.clips[0].future={value:7};
 const media=new Map([[a.mediaKey,source],[b.mediaKey,source],['orphan',new File(['extra'],'future.bin')]]);
 const head={magic:'NVPROJ1',ver:'V13',futureHeader:'keep',index:[{key:a.mediaKey,futureIndex:{n:6}}]};
 const v=await readProject(writeProject(p,media,'測試',head));assert.deepEqual(v.project,p);assert.equal(v.header.futureHeader,'keep');assert.deepEqual(v.header.index[0].futureIndex,{n:6});
 trimClip(v.project,a.id,1,9,10);const expected=structuredClone(p);expected.clips[0].inP=1;expected.clips[0].outP=9;
 const back=await readProject(writeProject(v.project,v.media,v.name,v.header));assert.deepEqual(back.project,expected);
 for(const [key,file]of media)assert.deepEqual(new Uint8Array(await back.media.get(key).arrayBuffer()),new Uint8Array(await file.arrayBuffer()));
});
test('reject corrupt header/index and missing media before producing incomplete project',async()=>{
 await assert.rejects(readProject(new Blob(['NVPROJ1'])));
 const {p}=fixture();assert.throws(()=>writeProject(p,new Map(),'missing'),/MISSING_MEDIA/);
 const json=JSON.stringify({magic:'NVPROJ1',state:p,index:[{key:'x',off:99,len:50}]}),b=new TextEncoder().encode(json),len=new Uint8Array(4);new DataView(len.buffer).setUint32(0,b.length,true);
 await assert.rejects(readProject(new Blob(['NVPROJ1',len,b])),/INVALID_MEDIA_INDEX/);
});
