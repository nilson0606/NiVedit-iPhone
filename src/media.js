import {Input,BlobSource,ALL_FORMATS} from '../vendor/mediabunny.mjs';
import {activeLayers,totalDuration} from './model.js';
import {drawContained} from './composition.js';
export async function inspectMedia(file,kind){
 if(kind==='image'||file.type.startsWith('image/')||/\.(png|jpe?g|webp|heic)$/i.test(file.name)){
  if(file.type==='image/gif'||/\.gif$/i.test(file.name))throw Error('GIF_LATER');
  const im=await createImageBitmap(file);const meta={kind:'image',duration:5,width:im.width,height:im.height,hasAudio:false};im.close();return meta;
 }
 const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
 try{
  const v=await input.getPrimaryVideoTrack(),a=await input.getPrimaryAudioTrack(),duration=await input.computeDuration();
  if(!v||!Number.isFinite(duration)||duration<.1)throw Error('INVALID_MEDIA');
  if(!await v.canDecode())throw Error('VIDEO_DECODE_UNSUPPORTED');
  return {kind:'video',duration,width:v.displayWidth,height:v.displayHeight,hasAudio:!!a,codec:v.codec,audioCodec:a?.codec||null};
 }finally{input.dispose();}
}
export class Preview{
 constructor(canvas,onTime,onError){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.onTime=onTime;this.onError=onError;this.time=0;this.playing=false;this.items=new Map();}
 setProject(project,media){
  this.pause();this.project=project;this.media=media;
  for(const [id,r] of this.items)if(!project?.clips.some(c=>c.id===id&&media.get(c.mediaKey)===r.file)){this.disposeItem(r);this.items.delete(id);}
  if(project){const factor=Math.min(1,720/Math.max(project.proj.w,project.proj.h));this.canvas.width=Math.round(project.proj.w*factor);this.canvas.height=Math.round(project.proj.h*factor);}
  this.time=Math.min(this.time,project?totalDuration(project):0);this.draw();
 }
 disposeItem(r){r.disposed=true;r.el.pause?.();r.el.removeAttribute('src');r.el.load?.();r.el.remove();r.node?.disconnect();r.gain?.disconnect();URL.revokeObjectURL(r.url);}
 clear(){this.pause();for(const r of this.items.values())this.disposeItem(r);this.items.clear();this.project=null;this.time=0;this.draw();}
 seek(time){this.pause();this.time=Math.max(0,Math.min(time,totalDuration(this.project)));this.draw();this.onTime(this.time,false);}
 connect(r){if(!this.audio||r.image||r.node)return;r.node=this.audio.createMediaElementSource(r.el);r.gain=this.audio.createGain();r.node.connect(r.gain).connect(this.audio.destination);}
 async play(){
  if(!this.project)return;
  this.audio??=new AudioContext();await this.audio.resume();
  if(this.time>=totalDuration(this.project)-.02)this.time=0;
  this.playing=true;this.anchor=performance.now()-this.time*1000;this.tick();
 }
 pause(){this.playing=false;cancelAnimationFrame(this.raf);for(const r of this.items.values())r.el.pause?.();this.onTime?.(this.time,false);}
 tick(){if(!this.playing)return;this.time=Math.min(totalDuration(this.project),(performance.now()-this.anchor)/1000);this.draw();this.onTime(this.time,true);if(this.time>=totalDuration(this.project)){this.pause();return;}this.raf=requestAnimationFrame(()=>this.tick());}
 draw(){
  const {ctx,canvas}=this;ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);if(!this.project)return;
  const active=new Set(),time=Math.min(this.time,Math.max(0,totalDuration(this.project)-.0001));
  for(const q of activeLayers(this.project,time)){
   const c=q.clip,file=this.media.get(c.mediaKey);if(!file)continue;active.add(c.id);
   let r=this.items.get(c.id);
   if(!r){
    const image=c.kind==='image',el=document.createElement(image?'img':'video'),url=URL.createObjectURL(file);
    r={el,url,file,image};this.items.set(c.id,r);
    if(!image){el.playsInline=true;el.preload='auto';el.setAttribute('playsinline','');if(!document.getElementById('video'))el.id='video';}
    el.className='media-source';document.getElementById('mediaPool').append(el);
    el.addEventListener(image?'load':'loadeddata',()=>{if(!r.disposed)this.draw();});el.addEventListener('seeked',()=>{if(!r.disposed)this.draw();});
    el.addEventListener('error',()=>{if(!r.failed&&!r.disposed){r.failed=true;this.pause();this.onError(Error('PREVIEW_DECODE: '+c.name));}});
    el.src=url;
   }
   if(r.image){if(r.el.complete&&r.el.naturalWidth)drawContained(ctx,r.el,canvas.width,canvas.height);continue;}
   const desired=Math.max(c.inP,Math.min(c.outP-.001,c.inP+time-q.start));
   if(r.el.readyState>=1&&!r.el.seeking&&Math.abs(r.el.currentTime-desired)>(this.playing?.18:.015))r.el.currentTime=desired;
   this.connect(r);
   const volume=c.muted||c.mute?0:Math.max(0,Math.min(2,c.vol??1));
   if(r.gain)r.gain.gain.value=volume;else r.el.volume=Math.min(1,volume);
   if(this.playing&&r.el.paused&&!r.starting){r.starting=true;r.el.play().catch(e=>{if(this.playing&&!r.disposed){this.pause();this.onError(e);}}).finally(()=>r.starting=false);}
   if(r.el.readyState>=2&&!r.el.seeking)drawContained(ctx,r.el,canvas.width,canvas.height);
  }
  for(const [id,r] of this.items)if(!active.has(id)){this.disposeItem(r);this.items.delete(id);}
 }
}
