import {PreviewAudio} from './preview-audio.js';
import {Input,BlobSource,ALL_FORMATS,CanvasSink} from '../vendor/mediabunny.mjs';
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
 constructor(canvas,onTime,onError){
  this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.back=document.createElement('canvas');this.onTime=onTime;this.onError=onError;
  this.time=0;this.playing=false;this.starting=false;this.items=new Map();this.epoch=0;this.painted=0;this.audio=new PreviewAudio(e=>this.fail(e));
 }
 fail(e){this.pause();this.onError(e);}
 setProject(project,media){
  this.pause();for(const r of this.items.values())this.disposeItem(r);this.items.clear();this.project=project;this.media=media;
  if(project){const factor=Math.min(1,720/Math.max(project.proj.w,project.proj.h)),w=Math.round(project.proj.w*factor),h=Math.round(project.proj.h*factor);if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;}
  this.time=Math.min(this.time,project?totalDuration(project):0);this.draw();
 }
 disposeItem(r){r.disposed=true;r.iterator?.return().catch(()=>{});try{r.input?.dispose();}catch{}r.image?.close();}
 clear(){this.pause();for(const r of this.items.values())this.disposeItem(r);this.items.clear();this.project=null;this.time=0;this.draw();}
 seek(time){this.pause();this.time=Math.max(0,Math.min(time,totalDuration(this.project)));this.draw();this.onTime(this.time,false);}
 async play(){
  if(!this.project||this.starting||this.playing)return;
  this.pause();this.starting=true;const epoch=this.epoch;
  // No await before unlock: retain the original user activation on iPhone.
  const unlocked=this.audio.unlock();
  if(this.time>=totalDuration(this.project)-.02)this.time=0;
  this.onTime(this.time,true);
  try{
   await unlocked;if(epoch!==this.epoch)return;
   await Promise.all([this.draw(),this.audio.prepare(this.project,this.media,this.time)]);
   if(epoch!==this.epoch)return;
   if(this.audio.context.state!=='running')throw Error('AUDIO_CONTEXT_NOT_RUNNING');
   this.starting=false;this.playing=true;this.lastFrameTick=-1;this.audio.start(this.time);this.tick();
  }catch(e){if(epoch===this.epoch){this.pause();throw e;}}
 }
 pause(){
  ++this.epoch;this.starting=false;this.playing=false;cancelAnimationFrame(this.raf);this.audio.stop();this.onTime?.(this.time,false);
 }
 tick(){
  if(!this.playing)return;
  if(this.audio.context.state!=='running'){this.fail(Error('AUDIO_CONTEXT_INTERRUPTED'));return;}
  this.time=Math.min(totalDuration(this.project),this.audio.currentTime());const frameTick=Math.floor(this.time*30);if(frameTick!==this.lastFrameTick){this.lastFrameTick=frameTick;this.draw();}this.onTime(this.time,true);
  if(this.time>=totalDuration(this.project)){this.pause();this.draw();return;}
  this.audio.pump(this.time);this.raf=requestAnimationFrame(()=>this.tick());
 }
 draw(){
  this.requested={time:this.time,epoch:this.epoch,playing:this.playing};
  if(!this.paintTask){
   this.paintTask=(async()=>{
    while(this.requested){const request=this.requested;this.requested=null;try{await this.paint(request);}catch(e){if(request.epoch===this.epoch)this.fail(e);}}
   })().finally(()=>{this.paintTask=null;if(this.requested)this.draw();});
  }
  return this.paintTask;
 }
 async resource(q){
  const c=q.clip,file=this.media.get(c.mediaKey);if(!file)return null;
  let r=this.items.get(c.id);if(r)return r;
  r={file};this.items.set(c.id,r);
  if(c.kind==='image'){r.image=await createImageBitmap(file);if(r.disposed)r.image.close();}
  else{
   r.input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
   r.track=await r.input.getPrimaryVideoTrack();
   if(r.disposed)return r;
   if(!r.track)throw Error('NO_VIDEO: '+c.name);
   r.sink=new CanvasSink(r.track,{width:this.canvas.width,height:this.canvas.height,fit:'contain',alpha:true,poolSize:2});
   r.frame=document.createElement('canvas');r.frame.width=this.canvas.width;r.frame.height=this.canvas.height;r.ctx=r.frame.getContext('2d');
  }
  return r;
 }
 cache(r,wrapped){
  if(!wrapped)return;r.ctx.clearRect(0,0,r.frame.width,r.frame.height);r.ctx.drawImage(wrapped.canvas,0,0);r.hasFrame=true;
 }
 async frame(r,q,time,request){
  const source=Math.max(q.clip.inP,Math.min(q.clip.outP-.0001,q.clip.inP+time-q.start));
  if(!request.playing){
   if(r.iterator){await r.iterator.return();r.iterator=null;}r.peek=null;
   let wrapped=await r.sink.getCanvas(source);
   if(!wrapped)wrapped=await r.sink.getCanvas(await r.track.getFirstTimestamp());
   this.cache(r,wrapped);r.streamEpoch=-1;
  }else{
   if(r.streamEpoch!==request.epoch){
    if(r.iterator)await r.iterator.return();
    r.iterator=r.sink.canvases(source,q.clip.outP);r.peek=null;r.streamEpoch=request.epoch;
   }
   // Monotonic decoding, with only current + one look-ahead canvas retained.
   // Never seek a running HTML media element to chase a wall clock.
   while(request.epoch===this.epoch){
    r.peek??=await r.iterator.next();
    if(request.epoch!==this.epoch)return;
    if(r.peek.done)break;
    if(r.peek.value.timestamp>source+.001){if(!r.hasFrame)this.cache(r,r.peek.value);break;}
    this.cache(r,r.peek.value);r.peek=null;
   }
  }
  return r.hasFrame?r.frame:null;
 }
 async paint(request){
  const project=this.project;
  if(!project){this.ctx.fillStyle='#000';this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);return;}
  const time=Math.min(request.time,Math.max(0,totalDuration(project)-.0001)),layers=activeLayers(project,time),active=new Set(layers.map(q=>q.clip.id));
  if(this.back.width!==this.canvas.width)this.back.width=this.canvas.width;if(this.back.height!==this.canvas.height)this.back.height=this.canvas.height;
  const ctx=this.back.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,this.back.width,this.back.height);
  for(const q of layers){
   const r=await this.resource(q);if(request.epoch!==this.epoch)return;if(!r||r.disposed)continue;
   const source=r.image||await this.frame(r,q,time,request);if(request.epoch!==this.epoch)return;
   if(!source)throw Error('PREVIEW_FRAME_UNAVAILABLE: '+q.clip.name);
   drawContained(ctx,source,this.back.width,this.back.height);
  }
  if(request.epoch!==this.epoch)return;
  // Publish only a complete composite. Waiting for decoding keeps the last frame.
  this.ctx.drawImage(this.back,0,0);this.painted++;this.canvas.dataset.frameReady=String(this.painted);
  for(const [id,r]of this.items)if(!active.has(id)){this.disposeItem(r);this.items.delete(id);}
 }
 get diagnostics(){return {backend:'decoded-canvas',playing:this.playing,preparing:this.starting,time:this.time,paintedFrames:this.painted,audio:this.audio.diagnostics};}
}
