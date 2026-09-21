// Shared preview / export contain geometry; upper layers preserve transparency.
export function drawContained(ctx,source,width,height){
 const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;
 if(!sw||!sh)return;const s=Math.min(width/sw,height/sh),w=sw*s,h=sh*s;
 ctx.drawImage(source,(width-w)/2,(height-h)/2,w,h);
}
