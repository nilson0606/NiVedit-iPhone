import {Input,BlobSource,ALL_FORMATS,Output,Mp4OutputFormat,BufferTarget,StreamTarget,CanvasSink,CanvasSource,AudioSampleSink,AudioSample,AudioSampleSource,canEncodeVideo,canEncodeAudio} from '../vendor/mediabunny.mjs';
import {layout,totalDuration,activeLayers,projectLimitations,timelineRows} from './model.js';
import {drawContained} from './composition.js';
self.onmessage=async({data})=>{
 const {project,media,jobId}=data,files=new Map(media),p=project.proj,duration=totalDuration(project),rows=timelineRows(project);
 const resources=new Map();let root,handle,output,success=false;
 try{
  if(projectLimitations(project).length)throw Error('UNSUPPORTED_PROJECT_FEATURES');
  if(!duration||!await canEncodeVideo('avc',{width:p.w,height:p.h,bitrate:p.bitrate*1e6}))throw Error('ENCODE_UNSUPPORTED');
  self.postMessage({type:'stage',stage:'prepare'});
  // Metadata is cheap; decoded frames/audio are streamed only while their clips are active.
  for(const q of rows){
   const file=files.get(q.clip.mediaKey);if(!file)throw Error('MISSING_MEDIA: '+q.clip.name);
   const r={q,file};resources.set(q.clip.id,r);
   if(q.clip.kind!=='image'){
    r.input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
    r.video=await r.input.getPrimaryVideoTrack();r.audio=await r.input.getPrimaryAudioTrack();
    if(q.clip.kind!=='audio'&&(!r.video||!await r.video.canDecode()))throw Error('VIDEO_DECODE_UNSUPPORTED: '+q.clip.name);
    if(r.audio&&!q.clip.muted&&!q.clip.mute&&q.clip.vol!==0&&!await r.audio.canDecode())throw Error('AUDIO_DECODE_UNSUPPORTED: '+q.clip.name);
   }
  }
  const audible=[...resources.values()].filter(r=>r.audio&&!r.q.clip.muted&&!r.q.clip.mute&&r.q.clip.vol!==0);
  if(audible.length&&!await canEncodeAudio('aac',{sampleRate:48000,numberOfChannels:2,bitrate:192000}))throw Error('AUDIO_ENCODE_UNSUPPORTED');
  let target,storage='memory';
  if(navigator.storage?.getDirectory)try{
   root=await navigator.storage.getDirectory();const f=await root.getFileHandle(jobId,{create:true});
   if(f.createSyncAccessHandle){
    handle=await f.createSyncAccessHandle();handle.truncate(0);
    target=new StreamTarget(new WritableStream({write({data,position}){let n=0;while(n<data.length){const count=handle.write(data.subarray(n),{at:position+n});if(!count)throw Error('STORAGE_WRITE_FAILED');n+=count;}},close(){handle.flush();}}),{chunked:true,chunkSize:1024*1024});storage='opfs';
   }
  }catch{handle?.close();handle=null;root=null;}
  if(!target){if(duration*(p.bitrate*1e6+192000)/8>48*1024*1024)throw Error('MEMORY_LIMIT');target=new BufferTarget();}
  const canvas=new OffscreenCanvas(p.w,p.h),ctx=canvas.getContext('2d',{alpha:false});
  output=new Output({format:new Mp4OutputFormat({fastStart:false}),target});
  const vs=new CanvasSource(canvas,{codec:'avc',bitrate:p.bitrate*1e6});output.addVideoTrack(vs,{frameRate:30});
  const as=audible.length?new AudioSampleSource({codec:'aac',bitrate:192000,sampleRate:48000,numberOfChannels:2}):null;
  if(as)output.addAudioTrack(as);
  await output.start();self.postMessage({type:'stage',stage:'encode',storage});
  const fps=30,frames=Math.ceil(duration*fps),rate=48000,totalSamples=Math.round(duration*rate);let audioOffset=0;
  async function audioBlock(end){
   const count=end-audioOffset;if(count<=0)return;const mix=new Float32Array(count*2),begin=audioOffset/rate,finish=end/rate;
   for(const r of audible){
    const q=r.q,c=q.clip;if(q.at>=finish||q.end<=begin)continue;
    if(!r.audioIter){r.audioIter=new AudioSampleSink(r.audio).samples(c.inP,c.outP);r.audioNext=await r.audioIter.next();}
    while(!r.audioNext.done){
     const sample=r.audioNext.value,t=q.at+sample.timestamp-c.inP,last=t+sample.duration;
     if(t>=finish)break;
     if(last>begin){
      const first=Math.max(0,Math.ceil((Math.max(t,q.at)-begin)*rate-1e-6)),limit=Math.min(count,Math.ceil((Math.min(last,q.end)-begin)*rate-1e-6));
      const planes=[0,Math.min(1,sample.numberOfChannels-1)].map(planeIndex=>{const x=new Float32Array(sample.numberOfFrames);sample.copyTo(x,{format:'f32-planar',planeIndex});return x;});
      for(let i=first;i<limit;i++){
       const source=(begin+i/rate-t)*sample.sampleRate,index=Math.max(0,Math.min(sample.numberOfFrames-1,Math.floor(source))),next=Math.min(index+1,sample.numberOfFrames-1),fraction=Math.max(0,source-index);
       for(let channel=0;channel<2;channel++)mix[i*2+channel]+=(planes[channel][index]*(1-fraction)+planes[channel][next]*fraction)*(c.vol??1);
      }
     }
     if(last>finish+1e-7)break;
     sample.close();r.audioNext=await r.audioIter.next();
    }
   }
   for(let i=0;i<mix.length;i++)mix[i]=Math.max(-1,Math.min(1,mix[i]));
   const sample=new AudioSample({data:mix,format:'f32',numberOfChannels:2,sampleRate:rate,timestamp:begin});
   try{await as.add(sample);}finally{sample.close();}audioOffset=end;
  }
  for(let frame=0;frame<frames;frame++){
   const time=frame/fps;ctx.fillStyle='#000';ctx.fillRect(0,0,p.w,p.h);
   for(const q of activeLayers(project,time)){
    const r=resources.get(q.clip.id);
    if(q.clip.kind==='image'){
     if(!r.image)r.image=await createImageBitmap(r.file);
     drawContained(ctx,r.image,p.w,p.h);
    }else{
     if(!r.videoIter){
      const first=Math.ceil(q.at*fps-1e-7),last=Math.ceil(q.end*fps-1e-7);
      function* times(){for(let f=first;f<last;f++)yield q.clip.inP+f/fps-q.at;}
      r.videoIter=new CanvasSink(r.video,{width:p.w,height:p.h,fit:'contain',alpha:true,poolSize:2}).canvasesAtTimestamps(times());
     }
     const wrapped=(await r.videoIter.next()).value;
     if(!wrapped)throw Error('MISSING_VIDEO_FRAME: '+q.clip.name);
     drawContained(ctx,wrapped.canvas,p.w,p.h);
    }
   }
   await vs.add(time,Math.min(1/fps,duration-time));
   if(as)await audioBlock(Math.min(totalSamples,Math.round(Math.min(duration,(frame+1)/fps)*rate)));
   for(const r of resources.values())if(r.q.end<=(frame+1)/fps+1e-7&&!r.closed){
    if(r.videoIter)await r.videoIter.return();if(r.audioNext&&!r.audioNext.done)r.audioNext.value.close();if(r.audioIter)await r.audioIter.return();
    r.image?.close();r.input?.dispose();r.closed=true;
   }
   if(frame%3===0)self.postMessage({type:'progress',value:Math.min(.99,(frame+1)/frames),storage});
  }
  vs.close();as?.close();await output.finalize();
  if(handle){handle.close();handle=null;}
  const blob=storage==='opfs'?await(await root.getFileHandle(jobId)).getFile():new Blob([target.buffer],{type:'video/mp4'});
  if(blob.size<1000)throw Error('EMPTY_OUTPUT');
  success=true;self.postMessage({type:'done',blob,storage,hasAudio:!!as});
 }catch(e){self.postMessage({type:'error',message:e.message||String(e)});}
 finally{
  for(const r of resources.values())if(!r.closed){try{if(r.audioNext&&!r.audioNext.done)r.audioNext.value.close();await r.audioIter?.return();await r.videoIter?.return();r.image?.close();r.input?.dispose();}catch{}}
  try{handle?.close();}catch{}if(!success&&root)try{await root.removeEntry(jobId);}catch{}
 }
};
