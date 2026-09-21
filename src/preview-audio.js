import {Input,BlobSource,ALL_FORMATS,AudioBufferSink} from '../vendor/mediabunny.mjs';
import {layout} from './model.js';
// Decode only a short look-ahead. Audio does not depend on hidden <video> elements.
export class PreviewAudio{
 constructor(onError){this.onError=onError;this.sequence=0;this.resources=new Map();this.nodes=new Set();this.scheduled=0;this.underruns=0;}
 unlock(){
  // Both calls occur synchronously in the user's Play gesture, before decoding.
  try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
  this.context??=new AudioContext();
  this.output??=this.context.createGain();
  if(!this.connected){this.output.connect(this.context.destination);this.connected=true;}
  const resumed=this.context.resume();
  const pulse=this.context.createBufferSource();pulse.buffer=this.context.createBuffer(1,1,this.context.sampleRate);pulse.connect(this.output);pulse.onended=()=>pulse.disconnect();pulse.start();
  return resumed;
 }
 stop(){
  ++this.sequence;this.running=false;this.prepared=[];this.pendingFill=null;
  for(const node of this.nodes){try{node.stop();}catch{}node.disconnect();}this.nodes.clear();
  for(const r of this.resources.values())this.dispose(r);this.resources.clear();
 }
 dispose(r){r.disposed=true;r.iterator?.return().catch(()=>{});try{r.input?.dispose();}catch{}r.gain?.disconnect();}
 async prepare(project,media,time){
  this.stop();const sequence=this.sequence;this.project=project;this.media=media;this.startTime=time;
  this.rows=layout(project).filter(q=>q.clip.kind!=='image'&&!q.clip.muted&&!q.clip.mute&&(q.clip.vol??1)>0&&q.end>time);
  await this.fill(time,time+.75,sequence);return sequence===this.sequence;
 }
 async resource(q,sequence){
  let r=this.resources.get(q.clip.id);if(r)return r;
  const file=this.media.get(q.clip.mediaKey);if(!file)throw Error('MISSING_MEDIA: '+q.clip.name);
  r={q,input:new Input({source:new BlobSource(file),formats:ALL_FORMATS})};this.resources.set(q.clip.id,r);
  const track=await r.input.getPrimaryAudioTrack();
  if(sequence!==this.sequence||r.disposed)return null;
  if(!track){r.done=true;return r;}
  if(!await track.canDecode())throw Error('AUDIO_DECODE_UNSUPPORTED: '+q.clip.name);
  if(sequence!==this.sequence||r.disposed)return null;
  r.gain=this.context.createGain();r.gain.gain.value=Math.max(0,Math.min(2,q.clip.vol??1));r.gain.connect(this.output);
  r.iterator=new AudioBufferSink(track).buffers(q.clip.inP+Math.max(0,this.startTime-q.at),q.clip.outP);
  return r;
 }
 async fill(time,until,sequence){
  for(const q of this.rows){
   if(sequence!==this.sequence)return;
   if(q.at>=until||q.end<=time)continue;
   const r=await this.resource(q,sequence);if(!r||r.done)continue;
   while(sequence===this.sequence&&!r.disposed){
    r.next??=await r.iterator.next();
    if(sequence!==this.sequence||r.disposed)return;
    if(r.next.done){r.done=true;break;}
    const chunk=r.next.value,at=q.at+chunk.timestamp-q.clip.inP;
    if(at>=until)break;
    const from=Math.max(at,q.at,this.startTime),end=Math.min(at+chunk.duration,q.end);
    if(end>from){const entry={r,buffer:chunk.buffer,at:from,offset:from-at,duration:end-from};if(this.running)this.schedule(entry);else this.prepared.push(entry);}
    r.next=null;
   }
  }
 }
 start(time){this.anchor=this.context.currentTime+.08-time;this.running=true;for(const entry of this.prepared)this.schedule(entry);this.prepared=[];}
 schedule({r,buffer,at,offset,duration}){
  let when=this.anchor+at;const late=Math.max(0,this.context.currentTime-when);
  if(late>0.015)this.underruns++;
  if(late>=duration)return;offset+=late;duration-=late;when+=late;
  const node=this.context.createBufferSource();node.buffer=buffer;node.connect(r.gain);this.nodes.add(node);
  node.onended=()=>{this.nodes.delete(node);node.disconnect();};
  node.start(when,offset,duration);this.scheduled++;
 }
 currentTime(){return Math.max(this.startTime,this.context.currentTime-this.anchor);}
 pump(time){
  if(!this.running||this.pendingFill)return;
  const sequence=this.sequence;
  const promise=this.fill(time,time+.75,sequence).catch(e=>{if(sequence===this.sequence)this.onError(e);}).finally(()=>{if(this.pendingFill===promise)this.pendingFill=null;});
  this.pendingFill=promise;
  for(const [id,r]of this.resources)if(r.q.end<time-.1){this.dispose(r);this.resources.delete(id);}
 }
 get diagnostics(){return {backend:'decoded-audio-buffers',state:this.context?.state||'not-started',scheduledBuffers:this.scheduled,lateBuffers:this.underruns,activeSources:this.nodes.size};}
}
