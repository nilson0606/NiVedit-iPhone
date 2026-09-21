// Main thread schedules audio already decoded in the preview worker.
export class PreviewAudio{
 constructor(decoder,onError){this.decoder=decoder;this.onError=onError;this.sequence=0;this.nodes=new Set();this.gains=new Map();this.scheduled=0;this.underruns=0;}
 unlock(){
  try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
  this.context??=new AudioContext();this.output??=this.context.createGain();
  if(!this.connected){this.output.connect(this.context.destination);this.connected=true;}
  const resumed=this.context.resume(),pulse=this.context.createBufferSource();
  pulse.buffer=this.context.createBuffer(1,1,this.context.sampleRate);pulse.connect(this.output);pulse.onended=()=>pulse.disconnect();pulse.start();
  return resumed;
 }
 stop(){
  ++this.sequence;this.running=false;this.prepared=[];this.pendingFill=null;
  for(const node of this.nodes){try{node.stop();}catch{}node.disconnect();}this.nodes.clear();
  for(const gain of this.gains.values())gain.disconnect();this.gains.clear();
 }
 async prepare(time){
  this.stop();this.startTime=time;const sequence=this.sequence;
  const result=await this.decoder.request('audioStart',{time,until:time+2});
  if(!result||sequence!==this.sequence)return false;
  this.prepared=result.chunks;this.bufferedUntil=time+2;return true;
 }
 start(time){this.anchor=this.context.currentTime+.08-time;this.running=true;for(const entry of this.prepared)this.schedule(entry);this.prepared=[];}
 schedule({clip,volume,at,rate,channels}){
  const duration=channels[0].length/rate;let when=this.anchor+at;const late=Math.max(0,this.context.currentTime-when);
  if(late>0.015)this.underruns++;if(late>=duration)return;
  let gain=this.gains.get(clip);
  if(!gain){gain=this.context.createGain();gain.gain.value=volume;gain.connect(this.output);this.gains.set(clip,gain);}
  const buffer=this.context.createBuffer(channels.length,channels[0].length,rate);
  channels.forEach((channel,i)=>buffer.copyToChannel(channel,i));
  const node=this.context.createBufferSource();node.buffer=buffer;node.connect(gain);this.nodes.add(node);
  node.onended=()=>{this.nodes.delete(node);node.disconnect();};node.start(when+late,late,duration-late);this.scheduled++;
 }
 currentTime(){return Math.max(this.startTime,this.context.currentTime-this.anchor);}
 pump(time){
  if(!this.running||this.pendingFill||this.bufferedUntil-time>1.5)return;
  const sequence=this.sequence,until=time+2;
  const promise=this.decoder.request('audio',{time,until}).then(result=>{
   if(!result||sequence!==this.sequence)return;
   for(const chunk of result.chunks)this.schedule(chunk);this.bufferedUntil=until;
  }).catch(e=>{if(sequence===this.sequence)this.onError(e);}).finally(()=>{if(this.pendingFill===promise)this.pendingFill=null;});
  this.pendingFill=promise;
 }
 get diagnostics(){return {backend:'worker-decoded-audio',state:this.context?.state||'not-started',scheduledBuffers:this.scheduled,lateBuffers:this.underruns,activeSources:this.nodes.size,lookAheadSeconds:2};}
}
