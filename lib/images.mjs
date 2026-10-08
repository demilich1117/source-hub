export const MAX_BYTES = 32 * 1024 * 1024;
const formats = {png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif'};
export function inspectImage(b) {
  if (!b.length || b.length > MAX_BYTES) throw new Error('单张图片上限 32 MiB。请先压缩或缩小尺寸。');
  let ext, width, height, animated = false;
  if (b.length >= 24 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    if(b.length<45||b.readUInt32BE(8)!==13||b.toString('ascii',12,16)!=='IHDR'||b.readUInt32BE(b.length-12)!==0||b.toString('ascii',b.length-8,b.length-4)!=='IEND')throw new Error('PNG 文件不完整。');
    ext='png'; width=b.readUInt32BE(16); height=b.readUInt32BE(20);
  } else if (b.length >= 10 && ['GIF87a','GIF89a'].includes(b.toString('ascii',0,6))) {
    if(b.at(-1)!==0x3b)throw new Error('GIF 文件不完整。');
    ext='gif'; width=b.readUInt16LE(6); height=b.readUInt16LE(8); animated=true;
  } else if (b.length >= 30 && b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WEBP') {
    if(b.readUInt32LE(4)+8!==b.length)throw new Error('WebP 文件不完整。');
    ext='webp'; const kind=b.toString('ascii',12,16);
    if (kind==='VP8X') { width=b.readUIntLE(24,3)+1; height=b.readUIntLE(27,3)+1; animated=!!(b[20]&2); }
    else if(kind==='VP8 ' && b[23]===0x9d && b[24]===1 && b[25]===0x2a) { width=b.readUInt16LE(26)&0x3fff; height=b.readUInt16LE(28)&0x3fff; }
    else if(kind==='VP8L' && b[20]===0x2f) { const bits=b.readUInt32LE(21); width=(bits&0x3fff)+1; height=((bits>>>14)&0x3fff)+1; }
  } else if (b.length >= 4 && b[0]===255 && b[1]===216) {
    if(b.at(-2)!==255||b.at(-1)!==217)throw new Error('JPEG 文件不完整。');
    ext='jpg'; let i=2;
    while(i+4<=b.length) {
      if(b[i]!==255) {i++;continue;} const marker=b[++i]; i++;
      if(marker===0xd9 || marker===0xda) break;
      if(marker===0 || marker===255 || (marker>=0xd0 && marker<=0xd7)) continue;
      const len=b.readUInt16BE(i); if(len<2 || i+len>b.length) break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && len>=7) {height=b.readUInt16BE(i+3);width=b.readUInt16BE(i+5);break;} i+=len;
    }
  }
  if (!ext || !width || !height) throw new Error('无法识别图片尺寸，请使用完整的 PNG、JPEG、WebP 或 GIF 文件。');
  if(width*height>100000000) throw new Error('图片超过一亿像素，请先缩小尺寸再入库。');
  return {ext,mime:formats[ext],width,height,animated};
}
