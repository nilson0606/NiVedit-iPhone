// V13 semantics: source inP/outP, timeline at, track, proj dimensions.
// Phase 1 has a single clip. NVPROJ1 import/export is a phase 2 gate.
export const BASELINE = '1e73b55ea388e6b9f1c7925f0651846cdb8f20c0';
export const VERSION = '0.1.3';
export function makeProject(file, meta) {
 return {schema:'nivedit-iphone-draft-1',baseline:BASELINE,clips:[{id:crypto.randomUUID(),name:file.name,kind:'video',track:0,at:0,inP:0,outP:meta.duration,vol:1,mute:false}],titles:[],musics:[],overlays:[],subs:[],proj:{aspect:meta.width<meta.height?'9:16':'16:9',w:meta.width<meta.height?720:1280,h:meta.width<meta.height?1280:720,fps:30,bitrate:4,fit:'contain',tracks:['video','img','over','title','music']}};
}
export function setTrim(project,start,end,duration) {
 if (![start,end,duration].every(Number.isFinite)||start<0||end>duration+0.001||end-start<0.1) throw new Error('INVALID_TRIM');
 project.clips[0].inP=start; project.clips[0].outP=Math.min(end,duration);
 return project;
}
export function formatTime(n){n=Math.max(0,Number(n)||0);return String(Math.floor(n/60)).padStart(2,'0')+':'+(n%60).toFixed(1).padStart(4,'0');}

export function setResolution(project, resolution) {
 if (![720,1080].includes(resolution)) throw new Error('INVALID_RESOLUTION');
 const portrait=project.proj.w<project.proj.h;
 const longEdge=resolution===1080?1920:1280;
 Object.assign(project.proj,{w:portrait?resolution:longEdge,h:portrait?longEdge:resolution,bitrate:resolution===1080?8:4});
 return project;
}

export function setAspect(project, aspect) {
 if (!['16:9','9:16'].includes(aspect)) throw new Error('INVALID_ASPECT');
 const short=Math.min(project.proj.w,project.proj.h),long=Math.max(project.proj.w,project.proj.h);
 Object.assign(project.proj,{aspect,w:aspect==='9:16'?short:long,h:aspect==='9:16'?long:short});
 return project;
}
