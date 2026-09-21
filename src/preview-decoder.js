// A disposable worker owns all preview decoders. Cancellation never waits for a codec.
export class PreviewDecoder{
 constructor(){this.pending=new Map();this.id=0;this.generation=0;this.lastFrameMs=0;}
 configure(project,media,width,height){this.config={project,media:[...media],width,height};}
 ensure(){
  if(this.worker)return this.worker;
  const worker=new Worker(new URL('./preview-worker.js',import.meta.url),{type:'module'});this.worker=worker;++this.generation;
  worker.onmessage=({data})=>{
   const request=this.pending.get(data.id);
   if(!request){data.bitmap?.close();return;}
   this.pending.delete(data.id);clearTimeout(request.timer);
   if(data.error)request.reject(Error(data.error));else{if(data.type==='frame')this.lastFrameMs=data.elapsed;request.resolve(data);}
  };
  worker.onerror=event=>{event.preventDefault();this.stop(Error(event.message||'PREVIEW_WORKER_FAILED'));};
  worker.postMessage({type:'init',...this.config});return worker;
 }
 request(type,data={}){
  const worker=this.ensure(),id=++this.id;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{if(this.pending.has(id))this.stop(Error('PREVIEW_DECODE_TIMEOUT'));},type==='frame'&&data.playing?3000:15000);
   this.pending.set(id,{resolve,reject,timer});worker.postMessage({type,id,...data});
  });
 }
 stop(error){
  const worker=this.worker;this.worker=null;worker?.terminate();
  for(const p of this.pending.values()){clearTimeout(p.timer);error?p.reject(error):p.resolve(null);}
  this.pending.clear();
 }
 get diagnostics(){return {workerActive:!!this.worker,generation:this.generation,pending:this.pending.size,lastFrameMs:this.lastFrameMs};}
}
