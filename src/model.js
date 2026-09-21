// V13 timing semantics. Unknown desktop fields are retained on import.
export const BASELINE='1e73b55ea388e6b9f1c7925f0651846cdb8f20c0',VERSION='0.2.3';
export function makeProject(file,meta){return {schema:'nivedit-iphone-draft-1',baseline:BASELINE,clips:[{id:crypto.randomUUID(),name:file.name,kind:'video',track:0,at:0,inP:0,outP:meta.duration,vol:1,muted:false}],titles:[],musics:[],overlays:[],subs:[],proj:{aspect:meta.width<meta.height?'9:16':'16:9',w:meta.width<meta.height?720:1280,h:meta.width<meta.height?1280:720,fps:30,bitrate:4,fit:'contain',tracks:['video','img','over','title','music']}};}
export function setTrim(p,start,end,duration){if(![start,end,duration].every(Number.isFinite)||start<0||end>duration+.001||end-start<.1)throw Error('INVALID_TRIM');p.clips[0].inP=start;p.clips[0].outP=Math.min(end,duration);return p;}
export function formatTime(n){const v=Number(n),ticks=Math.round(Math.max(0,Number.isFinite(v)?v:0)*10);return String(Math.floor(ticks/600)).padStart(2,'0')+':'+((ticks%600)/10).toFixed(1).padStart(4,'0');}
export function setResolution(p,r){if(![720,1080].includes(r))throw Error('INVALID_RESOLUTION');const portrait=p.proj.w<p.proj.h,l=r===1080?1920:1280;Object.assign(p.proj,{w:portrait?r:l,h:portrait?l:r,bitrate:r===1080?8:4});return p;}
export function setAspect(p,a){if(!['16:9','9:16'].includes(a))throw Error('INVALID_ASPECT');const s=Math.min(p.proj.w,p.proj.h),l=Math.max(p.proj.w,p.proj.h);Object.assign(p.proj,{aspect:a,w:a==='9:16'?s:l,h:a==='9:16'?l:s});return p;}
export const clipTrack=c=>c.kind==='audio'?3:c.kind==='image'?2:(c.track===1?1:0);
export const clipDuration=c=>Math.max(0,Number(c.outP)-Number(c.inP));
export function layout(p){
 const ends=[0,0,0];
 return p.clips.map((c,index)=>{
 const track=clipTrack(c),head=c.transMode==='add'&&c.trans?.type!=='none'?Math.max(0,Number(c.trans?.dur)||0):0,tail=c.transMode==='add'&&c.transOut?.type!=='none'?Math.max(0,Number(c.transOut?.dur)||0):0;
 const at=track===2?Math.max(0,Number.isFinite(c.at)?c.at:ends[track]):Math.max(ends[track],Number(c.at)||0),end=at+head+clipDuration(c)+tail;
 ends[track]=Math.max(ends[track],end);return {clip:c,index,track,at,start:at+head,end,duration:end-at};
 });
}
export const totalDuration=p=>Math.max(0,...layout(p).map(q=>q.end))||Math.max(0,...(p.musics||[]).map(m=>(Number(m.startAt)||0)+Math.min(Number(m.len)||0,Math.max(0,(Number(m.dur)||0)-(Number(m.offset)||0)))));
export function activeLayers(p,time){
 const order=p.proj.tracks||['video','img','over','title','music'];
 return layout(p).filter(q=>q.at<=time+1e-7&&time<q.end-1e-7).sort((a,b)=>order.indexOf(a.track===2?'img':'video')-order.indexOf(b.track===2?'img':'video')||a.track-b.track||a.at-b.at||a.index-b.index);
}
export function addClip(p,file,meta,track=0){
 const image=meta.kind==='image',key=crypto.randomUUID(),at=image?0:Math.max(0,...layout(p).filter(q=>q.track===track).map(q=>q.end));
 const c={id:crypto.randomUUID(),mediaKey:key,kind:image?'image':'video',name:file.name,dur:meta.duration,w:meta.width,h:meta.height,inP:0,outP:image?5:meta.duration,track:image?2:track,at,muted:false,vol:1,rot:0,x:.5,y:.5,scale:1,opacity:1,motionRot:0,cropShape:'none',cropKeep:'inside',cropX:.5,cropY:.5,cropW:1,cropH:1,cropSize:1,kf:null,kfT:null,transMode:'overlap',trans:{type:'none',dur:.6},transOut:{type:'none',dur:.6},fadeIn:0,fadeOut:0,fadeAudio:true};
 p.clips.push(c);return c;
}
export function moveClip(p,id,at,track){
 const music=findMusic(p,id);if(music){if(!Number.isFinite(at)||at<0)throw Error('INVALID_TIME');const visual=Math.max(0,...layout(p).map(q=>q.end));if(visual&&at>=visual)throw Error('AUDIO_OUTSIDE_VIDEO');music.startAt=at;music.autoLen=false;return;}
 if(!Number.isFinite(at)||at<0)throw Error('INVALID_TIME');
 const c=p.clips.find(c=>c.id===id);if(!c)throw Error('NO_CLIP');
 track=c.kind==='image'?2:track===1?1:0;
 const duration=layout(p).find(q=>q.clip===c).duration;
 if(track!==2&&layout(p).some(q=>q.clip!==c&&q.track===track&&at<q.end-1e-6&&at+duration>q.at+1e-6))throw Error('TRACK_OVERLAP');
 for(const q of layout(p))q.clip.at=q.at;
 c.at=at;c.track=track;p.clips.sort((a,b)=>clipTrack(a)-clipTrack(b)||(a.at||0)-(b.at||0));
}
export function trimClip(p,id,start,end,sourceDuration){
 const music=findMusic(p,id);if(music){if(![start,end].every(Number.isFinite)||start<0||end-start<.1||end>music.dur+.001)throw Error('INVALID_TRIM');music.offset=start;music.len=end-start;music.autoLen=false;return;}
 const c=p.clips.find(c=>c.id===id);
 if(!c||![start,end].every(Number.isFinite)||start<0||end-start<.1||(c.kind!=='image'&&end>sourceDuration+.001))throw Error('INVALID_TRIM');
 const q=layout(p).find(q=>q.clip===c),next=layout(p).find(v=>v.track===q.track&&v.at>=q.end-1e-6&&v.clip!==c);
 if(q.track!==2&&next&&q.at+q.duration-clipDuration(c)+end-start>next.at+1e-6)throw Error('TRACK_OVERLAP');
 for(const v of layout(p))v.clip.at=v.at;c.inP=start;c.outP=end;
}
export function splitClip(p,id,time){
 const music=findMusic(p,id);if(music){if(musicLimitations(music).length)throw Error('SPLIT_ADVANCED');const cut=time-music.startAt;if(cut<.1||music.len-cut<.1)throw Error('SPLIT_POSITION');const right={...structuredClone(music),id:crypto.randomUUID(),offset:music.offset+cut,startAt:time,len:music.len-cut,autoLen:false};music.len=cut;music.autoLen=false;p.musics.splice(p.musics.indexOf(music)+1,0,right);return right;}
 const q=layout(p).find(q=>q.clip.id===id);if(!q)throw Error('NO_CLIP');
 if(clipLimitations(q.clip).length)throw Error('SPLIT_ADVANCED');
 const offset=time-q.at;if(offset<.1||q.end-time<.1)throw Error('SPLIT_POSITION');
 for(const v of layout(p))v.clip.at=v.at;
 const c=q.clip,right={...structuredClone(c),id:crypto.randomUUID(),inP:c.inP+offset,at:time};
 c.outP=right.inP;p.clips.splice(p.clips.indexOf(c)+1,0,right);return right;
}
export function clipLimitations(c){
 const r=[];
 if(c.kf||c.kfT||['trans','transOut'].some(k=>c[k]&&c[k].type!=='none')||c.fadeIn>0||c.fadeOut>0)r.push('motion');
 if((c.cropShape&&c.cropShape!=='none')||c.rot||c.motionRot||(c.x!=null&&c.x!==.5)||(c.y!=null&&c.y!==.5)||(c.scale!=null&&c.scale!==1)||(c.opacity!=null&&c.opacity!==1))r.push('transform');
 if(c.grade&&Object.entries(c.grade).some(([k,v])=>k!=='preset'&&typeof v==='number'&&v!==0))r.push('grade');
 return r;
}
export function projectLimitations(p){
 const r=new Set([...p.clips.flatMap(clipLimitations),...(p.musics||[]).flatMap(musicLimitations)]);
 for(const k of ['titles','subs','overlays'])if(p[k]?.length)r.add(k);
 if(![720,1080].includes(Math.min(p.proj.w,p.proj.h))||![1280/720,720/1280].some(r=>Math.abs(p.proj.w/p.proj.h-r)<.001)||(p.proj.fps||30)!==30||!['contain',undefined].includes(p.proj.fit))r.add('output');
 return [...r];
}

// Basic standalone audio uses the desktop V13 musics collection.
export function musicLimitations(m){
 const r=[];
 if(m.loop||m.fadeIn>0||m.fadeOut>0||(m.vk||[]).length||m.autoLen)r.push('musicEffects');
 return r;
}
export function musicLayout(p){
 return (p.musics||[]).map((m,index)=>{
  const at=Math.max(0,Number(m.startAt)||0),offset=Math.max(0,Number(m.offset)||0);
  const length=Math.max(0,Math.min(Number(m.len)||0,Math.max(0,(Number(m.dur)||0)-offset)));
  return {music:m,clip:{...m,kind:'audio',inP:offset,outP:offset+length,vol:m.vol??1,muted:!!m.muted||(m.vol===0)},index,track:3,at,start:at,end:at+length,duration:length};
 }).filter(q=>q.duration>0);
}
export const timelineRows=p=>[...layout(p),...musicLayout(p)];
export const audioLayout=p=>timelineRows(p).filter(q=>q.clip.kind!=='image'&&!q.clip.muted&&!q.clip.mute&&(q.clip.vol??1)>0);
export function addMusic(p,file,meta,at=0){
 const visual=Math.max(0,...layout(p).map(q=>q.end));if(visual&&at>=visual)at=0;
 const m={id:crypto.randomUUID(),mediaKey:crypto.randomUUID(),name:file.name,dur:meta.duration,offset:0,startAt:Math.max(0,at),len:Math.min(meta.duration,visual?visual-at:meta.duration),autoLen:false,vol:.5,fadeIn:0,fadeOut:0,loop:false,xfade:0,vk:[]};
 (p.musics??=[]).push(m);return m;
}
export function findMusic(p,id){return p.musics?.find(m=>m.id===id);}
