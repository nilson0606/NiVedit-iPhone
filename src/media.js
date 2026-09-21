import {PreviewAudio} from './preview-audio.js';
import {Input,BlobSource,ALL_FORMATS} from '../vendor/mediabunny.mjs';
import {totalDuration} from './model.js';
import {PreviewDecoder} from './preview-decoder.js';
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
  this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.onTime=onTime;this.onError=onError;
  this.time=0;this.playing=false;this.starting=false;this.epoch=0;this.painted=0;this.stats={};
  this.decoder=new PreviewDecoder();this.audio=new PreviewAudio(this.decoder,e=>this.fail(e));
 }
 fail(e){this.pause();this.onError(e);}
 setProject(project,media){
  this.pause();this.project=project;this.media=media;
  if(project){
   const factor=Math.min(1,720/Math.max(project.proj.w,project.proj.h)),w=Math.round(project.proj.w*factor),h=Math.round(project.proj.h*factor);
   if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;
   this.decoder.configure(project,media,w,h);
  }
  this.time=Math.min(this.time,project?totalDuration(project):0);this.draw();
 }
 clear(){this.pause();this.project=null;this.time=0;this.ctx.fillStyle='#000';this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);}
 seek(time){this.pause();this.time=Math.max(0,Math.min(time,this.project?totalDuration(this.project):0));this.draw();this.onTime(this.time,false);}
 async play(){
  if(!this.project||this.starting||this.playing)return;
  this.pause();this.starting=true;const epoch=this.epoch;
  if(this.time>=totalDuration(this.project)-.02)this.time=0;this.onTime(this.time,true);
  try{
   // Synchronous unlock in the actual Play gesture; decoding runs off the UI thread.
   const unlocked=this.audio.unlock();await unlocked;if(epoch!==this.epoch)return;
   await Promise.all([this.draw(),this.audio.prepare(this.time)]);
   if(epoch!==this.epoch)return;
   if(this.audio.context.state!=='running')throw Error('AUDIO_CONTEXT_NOT_RUNNING');
   this.starting=false;this.playing=true;this.lastFrameTick=-1;this.lastPaintAt=0;this.lastTickAt=0;this.stats={frames:0,maxFrameGapMs:0,maxTickGapMs:0};this.audio.start(this.time);this.tick();
  }catch(e){if(epoch===this.epoch){this.pause();throw e;}}
 }
 pause(){
  ++this.epoch;this.starting=false;this.playing=false;cancelAnimationFrame(this.raf);
  this.requested=null;this.decoder.stop();this.audio.stop();this.onTime?.(this.time,false);
 }
 tick(){
  if(!this.playing)return;
  if(this.audio.context.state!=='running'){this.fail(Error('AUDIO_CONTEXT_INTERRUPTED'));return;}
  const now=performance.now();if(this.lastTickAt)this.stats.maxTickGapMs=Math.max(this.stats.maxTickGapMs,now-this.lastTickAt);this.lastTickAt=now;
  this.time=Math.min(totalDuration(this.project),this.audio.currentTime());
  // Do not seek/re-decode the last GOP after playback. Retain the complete last frame.
  if(this.time>=totalDuration(this.project)){this.pause();return;}
  const frameTick=Math.floor(this.time*30);
  if(frameTick!==this.lastFrameTick){this.lastFrameTick=frameTick;this.draw();this.onTime(this.time,true);}
  this.audio.pump(this.time);this.raf=requestAnimationFrame(()=>this.tick());
 }
 draw(){
  if(!this.project)return Promise.resolve();
  this.requested={time:this.time,epoch:this.epoch,playing:this.playing};
  if(!this.paintTask){
   this.paintTask=(async()=>{
    while(this.requested){const request=this.requested;this.requested=null;
     try{
      const result=await this.decoder.request('frame',request);
      if(!result)continue;
      try{
       if(request.epoch!==this.epoch)continue;
       this.ctx.drawImage(result.bitmap,0,0);
       if(this.playing){const now=performance.now();if(this.lastPaintAt)this.stats.maxFrameGapMs=Math.max(this.stats.maxFrameGapMs,now-this.lastPaintAt);this.lastPaintAt=now;this.stats.frames++;}
       this.painted++;this.canvas.dataset.frameReady=String(this.painted);
      }finally{result.bitmap.close();}
     }catch(e){if(request.epoch===this.epoch)this.fail(e);}
    }
   })().finally(()=>{this.paintTask=null;if(this.requested)this.draw();});
  }
  return this.paintTask;
 }
 get diagnostics(){return {backend:'worker-composite',playing:this.playing,preparing:this.starting,time:this.time,paintedFrames:this.painted,playbackStats:this.stats,...this.decoder.diagnostics,audio:this.audio.diagnostics};}
}
