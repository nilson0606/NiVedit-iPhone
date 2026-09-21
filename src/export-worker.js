import {Input,BlobSource,ALL_FORMATS,Output,Mp4OutputFormat,BufferTarget,StreamTarget,Conversion,canEncodeVideo} from '../vendor/mediabunny.mjs';
self.onmessage=async({data})=>{
 const {file,project,jobId}=data;
 let input,handle,root,success=false;
 try{
  const c=project.clips[0],p=project.proj;
  if(!await canEncodeVideo('avc',{width:p.w,height:p.h,bitrate:p.bitrate*1e6}))throw new Error('ENCODE_UNSUPPORTED: '+p.w+'x'+p.h);
  input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
  const vt=await input.getPrimaryVideoTrack(),at=await input.getPrimaryAudioTrack();
  if(!vt)throw new Error('NO_VIDEO');
  if(!await vt.canDecode())throw new Error('VIDEO_DECODE_UNSUPPORTED');
  if(at&&!await at.canDecode())throw new Error('AUDIO_DECODE_UNSUPPORTED');
  self.postMessage({type:'stage',stage:'prepare'});
  let target,storage='memory';
  if(navigator.storage?.getDirectory){
   try{
    root=await navigator.storage.getDirectory();
    const f=await root.getFileHandle(jobId,{create:true});
    if(f.createSyncAccessHandle){
     handle=await f.createSyncAccessHandle();handle.truncate(0);
     target=new StreamTarget(new WritableStream({write({data,position}){let written=0;while(written<data.length){const n=handle.write(data.subarray(written),{at:position+written});if(!n)throw new Error('STORAGE_WRITE_FAILED');written+=n;}},close(){handle.flush();}}),{chunked:true,chunkSize:1024*1024});
     storage='opfs';
    }
   }catch(e){if(handle){handle.close();handle=null;}root=null;}
  }
  if(!target){
   if((c.outP-c.inP)*(p.bitrate*1e6+192000)/8>48*1024*1024)throw new Error('MEMORY_LIMIT');
   target=new BufferTarget();
  }
  const output=new Output({format:new Mp4OutputFormat({fastStart:false}),target});
  const conversion=await Conversion.init({input,output,
   video:t=>t.id===vt.id?{codec:'avc',width:p.w,height:p.h,fit:'contain',frameRate:30,bitrate:p.bitrate*1e6,forceTranscode:true,allowRotationMetadata:false}:{discard:true},
   audio:t=>t.id===at?.id?{codec:'aac',sampleRate:48000,numberOfChannels:2,bitrate:192000,forceTranscode:true}:{discard:true},
   trim:{start:c.inP,end:c.outP},tags:{}});
  const lost=conversion.discardedTracks.filter(d=>d.track.id===vt.id||d.track.id===at?.id);
  if(!conversion.isValid||lost.length)throw new Error('ENCODE_UNSUPPORTED: '+lost.map(d=>d.reason).join(', '));
  conversion.onProgress=value=>self.postMessage({type:'progress',value:Math.min(.99,value),storage});
  self.postMessage({type:'stage',stage:'encode',storage});
  await conversion.execute();
  if(handle){handle.close();handle=null;}
  const blob=storage==='opfs'?await(await root.getFileHandle(jobId)).getFile():new Blob([target.buffer],{type:'video/mp4'});
  if(blob.size<1000)throw new Error('EMPTY_OUTPUT');
  success=true;self.postMessage({type:'done',blob,storage,hasAudio:!!at});
 }catch(e){self.postMessage({type:'error',message:e.message||String(e)});}
 finally{try{input?.dispose();}catch{}try{handle?.close();}catch{}if(!success&&root)try{await root.removeEntry(jobId);}catch{}}
};
