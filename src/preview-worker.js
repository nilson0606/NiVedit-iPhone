import {Input,BlobSource,ALL_FORMATS,VideoSampleSink,AudioSampleSink} from '../vendor/mediabunny.mjs';
import {activeLayers,layout,totalDuration} from './model.js';
import {drawContained} from './composition.js';
let project,files,canvas,ctx,audioStart=0,audioRows=[];
const videos=new Map(),audios=new Map();
function disposeVideo(r){
 r.current?.close();r.next?.value?.close();r.image?.close();
 r.iterator?.return().catch(()=>{});r.input?.dispose();
}
async function videoResource(q){
 let r=videos.get(q.clip.id);if(r)return r;
 const file=files.get(q.clip.mediaKey);if(!file)return null;
 r={};videos.set(q.clip.id,r);
 if(q.clip.kind==='image')r.image=await createImageBitmap(file);
 else{
  r.input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
  const track=await r.input.getPrimaryVideoTrack();if(!track)throw Error('NO_VIDEO: '+q.clip.name);
  r.sink=new VideoSampleSink(track,{optimizeForLatency:true});
  r.track=track;
 }
 return r;
}
async function frameFor(r,q,time,playing){
 const source=Math.max(q.clip.inP,Math.min(q.clip.outP-.0001,q.clip.inP+time-q.start));
 if(!playing){
  r.current?.close();r.current=await r.sink.getSample(source);
  if(!r.current)r.current=await r.sink.getSample(await r.track.getFirstTimestamp());
 }else{
  if(!r.iterator)r.iterator=r.sink.samples(source,q.clip.outP);
  // Drop obsolete samples before scaling. Only the chosen frame is drawn.
  while(true){
   r.next??=await r.iterator.next();
   if(r.next.done)break;
   if(r.next.value.timestamp>source+.001){
    if(!r.current){r.current=r.next.value;r.next=null;}break;
   }
   r.current?.close();r.current=r.next.value;r.next=null;
  }
 }
 return r.current;
}
async function render(time,playing){
 time=Math.min(time,Math.max(0,totalDuration(project)-.0001));
 const layers=activeLayers(project,time),active=new Set(layers.map(q=>q.clip.id));
 ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
 for(const q of layers){
  const r=await videoResource(q);if(!r)continue;
  if(r.image)drawContained(ctx,r.image,canvas.width,canvas.height);
  else{
   const sample=await frameFor(r,q,time,playing);if(!sample)throw Error('PREVIEW_FRAME_UNAVAILABLE: '+q.clip.name);
   // Single pass scaling for preview; export keeps its own high-quality rendering.
   sample.drawWithFit(ctx,{fit:'contain'});
  }
 }
 for(const [id,r]of videos)if(!active.has(id)){disposeVideo(r);videos.delete(id);}
 return canvas.transferToImageBitmap();
}
async function audioResource(q){
 let r=audios.get(q.clip.id);if(r)return r;
 const file=files.get(q.clip.mediaKey);if(!file)throw Error('MISSING_MEDIA: '+q.clip.name);
 r={q,input:new Input({source:new BlobSource(file),formats:ALL_FORMATS})};audios.set(q.clip.id,r);
 const track=await r.input.getPrimaryAudioTrack();if(!track){r.done=true;return r;}
 if(!await track.canDecode())throw Error('AUDIO_DECODE_UNSUPPORTED: '+q.clip.name);
 r.iterator=new AudioSampleSink(track).samples(q.clip.inP+Math.max(0,audioStart-q.at),q.clip.outP);
 return r;
}
async function audio(time,until){
 const chunks=[],transfer=[];
 for(const q of audioRows){
  if(q.at>=until||q.end<=time)continue;
  const r=await audioResource(q);if(r.done)continue;
  while(true){
   r.next??=await r.iterator.next();if(r.next.done){r.done=true;break;}
   const sample=r.next.value,at=q.at+sample.timestamp-q.clip.inP;
   if(at>=until)break;
   const from=Math.max(at,q.at,audioStart,time),end=Math.min(at+sample.duration,q.end);
   if(end>from){
    const first=Math.max(0,Math.ceil((from-at)*sample.sampleRate-1e-6)),last=Math.min(sample.numberOfFrames,Math.ceil((end-at)*sample.sampleRate-1e-6));
    if(last>first){
     const channels=[];
     for(let planeIndex=0;planeIndex<sample.numberOfChannels;planeIndex++){
      const channel=new Float32Array(last-first);
      sample.copyTo(channel,{format:'f32-planar',planeIndex,frameOffset:first,frameCount:last-first});
      channels.push(channel);transfer.push(channel.buffer);
     }
     chunks.push({clip:q.clip.id,volume:Math.max(0,Math.min(2,q.clip.vol??1)),at:at+first/sample.sampleRate,rate:sample.sampleRate,channels});
    }
   }
   sample.close();r.next=null;
  }
 }
 for(const [id,r]of audios)if(r.q.end<=time){r.next?.value?.close();r.iterator?.return().catch(()=>{});r.input.dispose();audios.delete(id);}
 return {chunks,transfer};
}
self.onmessage=async({data})=>{
 const {type,id}=data;
 try{
  if(type==='init'){
   project=data.project;files=new Map(data.media);canvas=new OffscreenCanvas(data.width,data.height);
   ctx=canvas.getContext('2d',{alpha:false});ctx.imageSmoothingQuality='low';return;
  }
  if(type==='frame'){
   const start=performance.now(),bitmap=await render(data.time,data.playing);
   self.postMessage({type,id,bitmap,elapsed:performance.now()-start},[bitmap]);
  }else if(type==='audioStart'||type==='audio'){
   if(type==='audioStart'){
    audioStart=data.time;
    audioRows=layout(project).filter(q=>q.clip.kind!=='image'&&!q.clip.muted&&!q.clip.mute&&(q.clip.vol??1)>0&&q.end>audioStart);
   }
   const {chunks,transfer}=await audio(data.time,data.until);self.postMessage({type,id,chunks},transfer);
  }
 }catch(e){self.postMessage({type,id,error:e.message||String(e)});}
};
