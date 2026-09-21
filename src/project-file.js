// NVPROJ1: seven-byte magic, little-endian header length, JSON, Blob slices.
// Keep unknown header/state/index fields: a phone edit must not erase desktop data.
const magic='NVPROJ1',encoder=new TextEncoder(),decoder=new TextDecoder();
export async function readProject(file){
 if(file.size<11)throw new Error('INVALID_PROJECT');
 const prefix=await file.slice(0,11).arrayBuffer();
 if(decoder.decode(prefix.slice(0,7))!==magic)throw new Error('INVALID_PROJECT');
 const length=new DataView(prefix).getUint32(7,true),base=11+length;
 if(length<2||length>32*1024*1024||base>file.size)throw new Error('INVALID_PROJECT_HEADER');
 const header=JSON.parse(await file.slice(11,base).text());
 if(header.magic!==magic||!Array.isArray(header.index)||!Array.isArray(header.state?.clips)||!header.state.proj)throw new Error('INVALID_PROJECT_HEADER');
 const media=new Map(),seen=new Set();
 for(const item of header.index){
  if(typeof item.key!=='string'||seen.has(item.key)||!Number.isSafeInteger(item.off)||!Number.isSafeInteger(item.len)||item.off<0||item.len<0||base+item.off+item.len>file.size)throw new Error('INVALID_MEDIA_INDEX');
  seen.add(item.key);media.set(item.key,new File([file.slice(base+item.off,base+item.off+item.len)],String(item.name||'media'),{type:String(item.type||'')}));
 }
 return {project:header.state,media,header,name:String(header.name||file.name.replace(/\.nvproj$/i,''))};
}
export function writeProject(project,media,name,originalHeader={}){
 const old=new Map((originalHeader.index||[]).map(x=>[x.key,x]));
 const objects=[...project.clips,...(project.musics||[]),...(project.overlays||[])];
 for(const c of objects)if(!c.mediaKey)throw new Error('MISSING_MEDIA: '+(c.name||c.id));
 const refs=new Set(objects.map(c=>c.mediaKey));
 for(const key of refs)if(!media.has(key))throw new Error('MISSING_MEDIA: '+key);
 // Also retain unrecognized embedded assets used by future desktop features.
 let off=0;const parts=[],index=[];
 for(const [key,file] of media){index.push({...old.get(key),key,name:file.name,type:file.type,size:file.size,off,len:file.size});parts.push(file);off+=file.size;}
 const bytes=encoder.encode(JSON.stringify({...originalHeader,magic,ver:originalHeader.ver||'V13',name,state:project,index}));
 const len=new Uint8Array(4);new DataView(len.buffer).setUint32(0,bytes.length,true);
 return new Blob([encoder.encode(magic),len,bytes,...parts],{type:'application/octet-stream'});
}
