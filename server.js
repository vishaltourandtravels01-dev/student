const express=require('express');
const {execFile}=require('child_process');
const {promisify}=require('util');
const execFileAsync=promisify(execFile);
const PDFDocument=require('pdfkit');
const multer=require('multer');
const sharp=require('sharp');
const fs=require('fs'); const path=require('path'); const os=require('os');
const app=express(); app.use(express.json({limit:'15mb'})); app.use(express.urlencoded({extended:true}));
const ROOT=__dirname, UP=path.join(ROOT,'uploads'), DATA=path.join(ROOT,'data','orders.json');
fs.mkdirSync(UP,{recursive:true}); fs.mkdirSync(path.dirname(DATA),{recursive:true}); if(!fs.existsSync(DATA)) fs.writeFileSync(DATA,'[]');
const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,UP),filename:(req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase()||''; cb(null,Date.now()+'-'+Math.random().toString(36).slice(2,8)+ext)}});
const upload=multer({storage, limits:{fileSize:25*1024*1024}});
app.use(express.static(ROOT));
app.get('/',(req,res)=>res.sendFile(path.join(ROOT,'index.html')));
app.get('/admin',(req,res)=>res.sendFile(path.join(ROOT,'admin.html')));
const read=()=>JSON.parse(fs.readFileSync(DATA,'utf8')); const write=x=>fs.writeFileSync(DATA,JSON.stringify(x,null,2));
const id=()=>String(Date.now()).slice(-8);
function fileUrl(p){return '/files/'+path.basename(p)}
app.use('/files',express.static(UP));
app.get('/api/orders',(req,res)=>res.json(read().sort((a,b)=>b.createdAt-a.createdAt)));
app.get('/api/order/:id',(req,res)=>{const o=read().find(x=>x.id===req.params.id); o?res.json(o):res.status(404).end()});
app.post('/api/upload',upload.array('files',10),(req,res)=>{try{const files=(req.files||[]).map(f=>({path:f.path,name:f.originalname,mime:f.mimetype,url:fileUrl(f.path)})); res.json({files});}catch(e){res.status(500).json({error:e.message})}});
async function filterPdfToPdf(inputPath, filter, adjust={}){
  const tmp=path.join(UP,'pdf-filter-'+Date.now()+'-'+Math.random().toString(36).slice(2));
  fs.mkdirSync(tmp,{recursive:true});
  try{
    // Prefer Poppler when available. On many Windows installs pdftoppm is not
    // installed, which previously caused: spawn pdftoppm ENOENT. Fall back to
    // Ghostscript when available; if neither renderer exists, keep the PDF
    // unchanged instead of failing the whole editor operation.
    let rendered=false;
    try{
      await execFileAsync(process.platform==='win32'?'pdftoppm.exe':'pdftoppm',['-jpeg','-r','150',inputPath,path.join(tmp,'page')],{maxBuffer:1024*1024*8});
      rendered=true;
    }catch(_e){
      const gsCandidates=process.platform==='win32'?['gswin64c.exe','gswin32c.exe']:['gs'];
      for(const gs of gsCandidates){
        try{
          await execFileAsync(gs,['-dSAFER','-dBATCH','-dNOPAUSE','-sDEVICE=jpeg','-r150','-dJPEGQ=92','-sOutputFile='+path.join(tmp,'page-%d.jpg'),inputPath],{maxBuffer:1024*1024*8});
          rendered=true; break;
        }catch(_gs){}
      }
    }
    const imgs=fs.readdirSync(tmp).filter(x=>/^page(?:-\d+)?\.jpg$/i.test(x)).sort((a,b)=>{
      const na=Number((a.match(/(\d+)/)||['0',0])[1]), nb=Number((b.match(/(\d+)/)||['0',0])[1]); return na-nb;
    });
    if(!rendered || !imgs.length){
      const fallback=path.join(UP,'filtered-pdf-fallback-'+Date.now()+'.pdf');
      fs.copyFileSync(inputPath,fallback);
      return {path:fallback,url:fileUrl(fallback),name:'filtered-'+path.basename(inputPath),mime:'application/pdf',warning:'PDF renderer उपलब्ध नहीं है; PDF को बिना rasterize किए सुरक्षित रखा गया है। Preview में Color Adjust दिखेगा।'};
    }
    const {PDFDocument}=require('pdf-lib');
    const out=await PDFDocument.create();
    for(const name of imgs){
      const inFile=path.join(tmp,name);
      let pipe=sharp(inFile).rotate();
      if(filter==='soft') pipe=pipe.modulate({brightness:1.04,saturation:.90}).linear(.96,10);
      else if(filter==='sharp') pipe=pipe.modulate({saturation:.75}).linear(1.35,-45).sharpen({sigma:1.1});
      else if(filter==='bw') pipe=pipe.grayscale().linear(1.18,-23);
      else if(filter==='carbon') pipe=pipe.grayscale().linear(1.65,-110).sharpen({sigma:1});
      else if(filter==='gray') pipe=pipe.grayscale();
      const a=adjust||{};
      if(a.brightness && Number(a.brightness)!==100) pipe=pipe.modulate({brightness:Number(a.brightness)/100});
      if(a.saturation && Number(a.saturation)!==100) pipe=pipe.modulate({saturation:Number(a.saturation)/100});
      if(a.contrast && Number(a.contrast)!==100) pipe=pipe.linear(Math.max(.2,Number(a.contrast)/100),128*(1-Number(a.contrast)/100));
      if(a.exposure && Number(a.exposure)!==0) pipe=pipe.modulate({brightness:Math.max(.1,1+Number(a.exposure)/100)});
      if(a.bw && Number(a.bw)>0) pipe=pipe.grayscale();
      if(a.sharpness && Number(a.sharpness)>0) pipe=pipe.sharpen({sigma:Math.max(.1,Number(a.sharpness)/25)});
      const jpg=await pipe.jpeg({quality:92}).toBuffer();
      const meta=await sharp(jpg).metadata();
      const page=out.addPage([Math.max(1,(meta.width||1)*72/150),Math.max(1,(meta.height||1)*72/150)]);
      const img=await out.embedJpg(jpg);page.drawImage(img,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});
    }
    const bytes=await out.save();
    const outPath=path.join(UP,'filtered-pdf-'+Date.now()+'.pdf');fs.writeFileSync(outPath,bytes);
    return {path:outPath,url:fileUrl(outPath),name:'filtered-'+path.basename(inputPath),mime:'application/pdf'};
  }finally{try{fs.rmSync(tmp,{recursive:true,force:true})}catch{}}
}

app.post('/api/pdf-edit',upload.fields([{name:'file',maxCount:1},{name:'signature',maxCount:1}]),async(req,res)=>{try{
  const f=req.files&&req.files.file&&req.files.file[0]; if(!f) throw Error('PDF file required');
  if(path.extname(f.originalname).toLowerCase()!=='.pdf' && f.mimetype!=='application/pdf') throw Error('PDF file required');
  const {PDFDocument,rgb,degrees,StandardFonts}=require('pdf-lib');
  const action=JSON.parse(req.body.action||'{}');
  if((action.filter && ['soft','sharp','bw','carbon','gray'].includes(String(action.filter))) || action.adjust){ const result=await filterPdfToPdf(f.path,String(action.filter||'normal'),action.adjust||{}); try{fs.unlinkSync(f.path)}catch{}; return res.json(result); }
  const doc=await PDFDocument.load(fs.readFileSync(f.path),{ignoreEncryption:true});
  const pages=doc.getPages();
  if(action.rotate){for(const p of pages)p.setRotation(degrees((p.getRotation().angle||0)+Number(action.rotate)));}
  if(action.crop){
    const a=String(action.crop).split(',').map(Number); if(a.length===4&&a.every(Number.isFinite)){for(const p of pages){const w=p.getWidth(),h=p.getHeight();const l=Math.max(0,Math.min(90,a[0]))/100*w,t=Math.max(0,Math.min(90,a[1]))/100*h,r=Math.max(0,Math.min(90,a[2]))/100*w,b=Math.max(0,Math.min(90,a[3]))/100*h;p.setCropBox(l,b,Math.max(1,w-l-r),Math.max(1,h-t-b));}}}
  if(action.erase){
    const a=String(action.erase).split(',').map(Number); if(a.length===5&&a.every(Number.isFinite)){const pageNo=Math.max(1,Math.round(a[0]));const p=pages[Math.min(pages.length-1,pageNo-1)];const w=p.getWidth(),h=p.getHeight();const x=Math.max(0,Math.min(100,a[1]))/100*w,yTop=Math.max(0,Math.min(100,a[2]))/100*h,rw=Math.max(.1,Math.min(100,a[3]))/100*w,rh=Math.max(.1,Math.min(100,a[4]))/100*h;p.drawRectangle({x,y:h-yTop-rh,width:rw,height:rh,color:rgb(1,1,1)});}}
  if(action.watermark){const font=await doc.embedFont(StandardFonts.HelveticaBold);for(const p of pages){const text=String(action.watermark).slice(0,100);p.drawText(text,{x:p.getWidth()/2-120,y:p.getHeight()/2,size:30,font,color:rgb(.1,.1,.1),opacity:.25,rotate:degrees(-25)});}}
  const sf=req.files&&req.files.signature&&req.files.signature[0]; if(action.signature&&sf){const img=sf.mimetype==='image/png'?await doc.embedPng(fs.readFileSync(sf.path)):await doc.embedJpg(fs.readFileSync(sf.path));for(const p of pages){const w=Math.min(p.getWidth()*.3,180),h=w*(img.height/img.width);p.drawImage(img,{x:p.getWidth()-w-24,y:24,width:w,height:h,opacity:.95});}}
  const bytes=await doc.save();const out=path.join(UP,'edited-pdf-'+Date.now()+'.pdf');fs.writeFileSync(out,bytes);try{fs.unlinkSync(f.path)}catch{};if(req.files.signature)try{fs.unlinkSync(req.files.signature[0].path)}catch{};
  res.json({path:out,url:fileUrl(out),name:(f.originalname||'document').replace(/\.pdf$/i,'')+'-edited.pdf',mime:'application/pdf'});
}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/crop',upload.single('file'),async(req,res)=>{try{const f=req.file;if(!f)throw Error('Image required'); if(!/^image\//.test(f.mimetype))throw Error('Crop केवल photo पर करें'); const x=Math.max(0,Number(req.body.x)||0),y=Math.max(0,Number(req.body.y)||0),w=Math.max(1,Number(req.body.w)||1),h=Math.max(1,Number(req.body.h)||1),rw=Math.max(1,Number(req.body.rw)||0),rh=Math.max(1,Number(req.body.rh)||0); let im=sharp(f.path).rotate(); const meta=await im.metadata(); const left=Math.min(x,Math.max(0,(meta.width||1)-1)), top=Math.min(y,Math.max(0,(meta.height||1)-1)); const width=Math.min(w,(meta.width||1)-left), height=Math.min(h,(meta.height||1)-top); let pipe=im.extract({left,top,width,height}); if(rw>0&&rh>0) pipe=pipe.resize({width:rw,height:rh,fit:'fill'}); const out=path.join(UP,'crop-'+Date.now()+'.jpg'); await pipe.jpeg({quality:95}).toFile(out); try{fs.unlinkSync(f.path)}catch{} res.json({path:out,url:fileUrl(out),name:'cropped.jpg',mime:'image/jpeg'});
}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/pdf-from-images',upload.array('pages',100),async(req,res)=>{try{const files=req.files||[];if(!files.length)throw Error('PDF pages required');const {PDFDocument}=require('pdf-lib');const out=await PDFDocument.create();for(const f of files){const meta=await sharp(f.path).metadata();const w=meta.width||1,h=meta.height||1;const page=out.addPage([w*72/150,h*72/150]);const img=await out.embedJpg(fs.readFileSync(f.path));page.drawImage(img,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});try{fs.unlinkSync(f.path)}catch{}}const bytes=await out.save();const outPath=path.join(UP,'pdf-4corner-'+Date.now()+'.pdf');fs.writeFileSync(outPath,bytes);res.json({path:outPath,url:fileUrl(outPath),name:'4-corner-cropped.pdf',mime:'application/pdf'});}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/card-layout',upload.single('file'),async(req,res)=>{
  try{
    const f=req.file; if(!f||!/^image\//.test(f.mimetype)) throw Error('PAN/Identity Card image required');
    // A4 at 150 DPI: 210 x 297 mm. Card: 85.60 x 53.98 mm.
    const A4W=1240,A4H=1754;
    const CARDW=Math.round(A4W*(85.60/210));
    const CARDH=Math.round(A4H*(53.98/297));
    const out=path.join(UP,'pan-identity-a4-'+Date.now()+'.jpg');
    const card=await sharp(f.path).rotate().resize({width:CARDW,height:CARDH,fit:'contain',background:{r:255,g:255,b:255}}).jpeg({quality:97}).toBuffer();
    const left=Math.round((A4W-CARDW)/2), top=Math.round(A4H*(2/297));
    await sharp({create:{width:A4W,height:A4H,channels:3,background:{r:255,g:255,b:255}}})
      .composite([{input:card,left,top}]).jpeg({quality:97}).toFile(out);
    try{fs.unlinkSync(f.path)}catch{}
    res.json({url:fileUrl(out),path:out,name:'PAN-Identity-A4-Actual-Size.jpg',mime:'image/jpeg',cardSizeMm:'85.60 x 53.98 mm',paper:'A4'});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/id-layout',upload.fields([{name:'front',maxCount:1},{name:'back',maxCount:1}]),async(req,res)=>{try{
  if(!req.files.front||!req.files.back) throw Error('Front और Back दोनों चुनें');
  // Aadhaar/ID-1 physical card size: 85.60 x 53.98 mm.
  // Render the final composition on an A4 canvas at 150 DPI so the card
  // remains the real-world size when the A4 image is printed at 100%.
  const A4W=1240, A4H=1754;
  const CARDW=Math.round(A4W*(85.60/210));
  const CARDH=Math.round(A4H*(53.98/297));
  // Place Front + Back side-by-side near the upper part of A4.
  // Each card stays exactly 85.60 x 53.98 mm; only the gap/position changes.
  const GAP=Math.round(A4W*(10/210)); // 10 mm gap
  const left=Math.round((A4W-(CARDW*2+GAP))/2);
  const top1=140;
  const top2=top1;
  const out=path.join(UP,'id-'+Date.now()+'.jpg');
  const make=async f=>sharp(f.path).rotate().resize({width:CARDW,height:CARDH,fit:'contain',background:{r:255,g:255,b:255}}).jpeg({quality:97}).toBuffer();
  const [a,b]=await Promise.all([make(req.files.front[0]),make(req.files.back[0])]);
  await sharp({create:{width:A4W,height:A4H,channels:3,background:{r:255,g:255,b:255}}})
    .composite([{input:a,left,top:top1},{input:b,left:left+CARDW+GAP,top:top2}])
    .jpeg({quality:97}).toFile(out);
  [req.files.front[0],req.files.back[0]].forEach(f=>{try{fs.unlinkSync(f.path)}catch{}});
  res.json({url:fileUrl(out),path:out,name:'Aadhaar-Front-Back-A4-Actual-Size-SideBySide.jpg',mime:'image/jpeg',cardSizeMm:'85.60 x 53.98 mm',paper:'A4'});
}catch(e){res.status(400).json({error:e.message})}});

app.post('/api/passport-layout',upload.single('photo'),async(req,res)=>{try{
  if(!req.file) throw Error('Passport photo चुनें');
  const A4W=1240,A4H=1754,DPI=150;
  const MARGIN=Math.round(DPI*(2/25.4));
  const USABLE_W=A4W-(MARGIN*2);
  const PW=Math.floor(USABLE_W/6);
  const PH=Math.round(PW*(45/35));
  const border=3;
  const src=await sharp(req.file.path).rotate().resize({width:PW-border*2,height:PH-border*2,fit:'cover',position:'centre'}).jpeg({quality:98}).toBuffer();
  const overlays=[];
  for(let col=0;col<6;col++){
    const x=MARGIN+col*PW,y=MARGIN;
    overlays.push({input:{create:{width:PW,height:PH,channels:3,background:{r:255,g:255,b:255}}},left:x,top:y});
    overlays.push({input:src,left:x+border,top:y+border});
    overlays.push({input:Buffer.from(`<svg width="${PW}" height="${PH}" xmlns="http://www.w3.org/2000/svg"><rect x="${border/2}" y="${border/2}" width="${PW-border}" height="${PH-border}" fill="none" stroke="black" stroke-width="${border}"/></svg>`),left:x,top:y});
  }
  const out=path.join(UP,'passport-6-a4-'+Date.now()+'.jpg');
  await sharp({create:{width:A4W,height:A4H,channels:3,background:{r:255,g:255,b:255}}}).composite(overlays).jpeg({quality:97}).toFile(out);
  try{fs.unlinkSync(req.file.path)}catch{}
  res.json({url:fileUrl(out),path:out,name:'Passport-6-Photos-A4-One-Row-2mm-Margins.jpg',mime:'image/jpeg',photoSizeMm:(PW*25.4/DPI).toFixed(2)+' x '+(PH*25.4/DPI).toFixed(2)+' mm',count:6,paper:'A4',topMarginMm:2,leftMarginMm:2,rightMarginMm:2});
}catch(e){res.status(400).json({error:e.message})}});

app.post('/api/open-pdf',async(req,res)=>{try{const file=req.body&&req.body.path;if(!file)throw Error('PDF path required');const p=path.isAbsolute(file)?file:path.join(UP,path.basename(file));await openPdfInAdobe(p);res.json({ok:true});}catch(e){res.status(500).json({error:e.message})}});

async function getPdfPageCount(file){
  try{
    if(!file || path.extname(file).toLowerCase()!=='.pdf') return 1;
    const {PDFDocument}=require('pdf-lib');
    const bytes=fs.readFileSync(file);
    const doc=await PDFDocument.load(bytes,{ignoreEncryption:true});
    return Math.max(1,doc.getPageCount());
  }catch(e){ return 1; }
}
async function makePdfPageSubset(file,pageIndex){
  const {PDFDocument}=require('pdf-lib');
  const src=await PDFDocument.load(fs.readFileSync(file),{ignoreEncryption:true});
  const out=await PDFDocument.create();
  const [p]=await out.copyPages(src,[pageIndex]);
  out.addPage(p);
  const bytes=await out.save();
  const outPath=path.join(UP,'print-page-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.pdf');
  fs.writeFileSync(outPath,bytes);
  return outPath;
}
async function makePdfAllSubset(file,startIndex=0){
  const count=await getPdfPageCount(file);
  if(startIndex<=0) return file;
  if(startIndex>=count) return null;
  const {PDFDocument}=require('pdf-lib');
  const src=await PDFDocument.load(fs.readFileSync(file),{ignoreEncryption:true});
  const out=await PDFDocument.create();
  const indexes=[]; for(let i=startIndex;i<count;i++) indexes.push(i);
  const pages=await out.copyPages(src,indexes); pages.forEach(p=>out.addPage(p));
  const bytes=await out.save();
  const outPath=path.join(UP,'print-pages-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.pdf');
  fs.writeFileSync(outPath,bytes); return outPath;
}
function orderFilePaths(o){
  return (o.files||[]).map(f=>f.path||path.join(UP,path.basename(f.url||''))).filter(Boolean);
}

app.post('/api/orders',async(req,res)=>{try{const body=req.body; if(!body.files||!body.files.length) throw Error('File required'); const orders=read(); const files=Array.isArray(body.files)?body.files:[]; const firstFile=files[0]||{}; const firstPath=firstFile.path||path.join(UP,path.basename(firstFile.url||'')); const pageCount=await getPdfPageCount(firstPath);
const orderType=body.type||'document'; const selectedMode=orderType==='passport'?'COLOR':(String(body.mode||'BW').toUpperCase()==='BW'?'BW':'COLOR'); const o={id:id(),createdAt:Date.now(),status:'PENDING',name:body.name||'Customer',phone:body.phone||'',type:orderType,files,mode:selectedMode,copies:Math.max(1,Number(body.copies)||1),paper:body.paper||'A4',sides:body.sides||'SINGLE',paymentMode:body.paymentMode||'CASH',price:Number(body.price)||0,note:body.note||'',pageCount,printMode:pageCount>1?'ONE_BY_ONE':'ALL',outputMode:'DIRECT_PRINT',currentPage:0,backApproval:false}; orders.push(o); write(orders); res.json(o);}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/orders/:id/approve',async(req,res)=>{const orders=read(); const o=orders.find(x=>x.id===req.params.id); if(!o)return res.status(404).json({error:'Order not found'}); if(o.status!=='PENDING')return res.status(400).json({error:'Already processed'}); o.status='APPROVED'; o.approvedAt=Date.now(); write(orders); res.json(o);});
app.post('/api/orders/:id/reject',(req,res)=>{const orders=read(); const o=orders.find(x=>x.id===req.params.id); if(!o)return res.status(404).json({error:'Order not found'}); o.status='REJECTED'; o.rejectReason=req.body.reason||''; write(orders); res.json(o)});
app.post('/api/orders/:id/delete',(req,res)=>{try{const orders=read(); const idx=orders.findIndex(x=>x.id===req.params.id); if(idx<0)return res.status(404).json({error:'Order not found'}); const o=orders[idx]; const removed=[]; for(const f of orderFilePaths(o)){ try{const rp=path.resolve(f); const base=path.resolve(UP)+path.sep; if(rp.startsWith(base) && fs.existsSync(rp)){fs.unlinkSync(rp); removed.push(path.basename(rp));} }catch{} } orders.splice(idx,1); write(orders); res.json({ok:true,id:o.id,removed});}catch(e){res.status(500).json({error:'Data delete failed: '+e.message})}});
function pageSpec(paper){
  const sizes={
    A4:[595.28,841.89],
    '4x6':[288,432],
    '5x7':[360,504],
    A5:[419.53,595.28],
    LETTER:[612,792]
  };
  return sizes[paper]||sizes.A4;
}
async function imageToExactPdf(file,paper,mode){
  const [PW,PH]=pageSpec(paper);
  const out=path.join(UP,'print-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)+'.pdf');
  let src=file;
  let temp=null;
  if(mode==='BW'){
    const t=path.join(UP,'gray-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)+'.jpg');
    await sharp(file).rotate().grayscale().jpeg({quality:95}).toFile(t); src=t; temp=t;
  }
  const meta=await sharp(src).metadata();
  const doc=new PDFDocument({size:[PW,PH],margin:0,autoFirstPage:false});
  const stream=fs.createWriteStream(out);
  doc.pipe(stream); doc.addPage({size:[PW,PH],margin:0});
  const iw=meta.width||1, ih=meta.height||1;
  // The selected paper is the actual PDF page size. Keep the content at
  // natural size where possible, start exactly 2 mm from the top, and never
  // add a vertical-centering margin. If the image is larger than the selected
  // paper, scale it down to fit while keeping the top edge fixed.
  const TOP_MM=2;
  const TOP_PT=TOP_MM/25.4*72;
  const maxW=PW;
  const maxH=Math.max(1,PH-TOP_PT);
  const scale=Math.min(1,maxW/iw,maxH/ih);
  const w=iw*scale,h=ih*scale;
  const x=(PW-w)/2,y=TOP_PT;
  doc.image(src,x,y,{width:w,height:h});
  doc.end();
  await new Promise((resolve,reject)=>{stream.on('finish',resolve);stream.on('error',reject)});
  if(temp)try{fs.unlinkSync(temp)}catch{}
  return out;
}
function printerPath(){return process.env.SUMATRA||null}

function rasterPaperSpec(paper){
  const sizes={A4:{w:827,h:1169,pxW:1240,pxH:1754},'4x6':{w:400,h:600,pxW:600,pxH:900},'5x7':{w:500,h:700,pxW:750,pxH:1050},A5:{w:583,h:827,pxW:874,pxH:1240},LETTER:{w:850,h:1100,pxW:1275,pxH:1650}};
  return sizes[paper]||sizes.A4;
}

async function imageToPrintJpg(file,paper,mode){
  if(process.platform!=='win32') throw Error('Direct image printing इस ZIP में Windows पर है');
  const spec=rasterPaperSpec(paper);
  const out=path.join(UP,'print-image-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)+'.jpg');
  let pipe=sharp(file).rotate().flatten({background:{r:255,g:255,b:255}});
  if(mode==='BW') pipe=pipe.grayscale();
  // General documents/photos: fit the complete file inside the SELECTED
  // PAPER, keep aspect ratio, start exactly 2 mm from the top, and never
  // vertically center the content. This is also the same composition shown
  // in the Review/Admin preview.
  const meta=await sharp(file).metadata();
  const iw=Math.max(1,meta.width||1), ih=Math.max(1,meta.height||1);
  const TOP_PX=Math.max(1,Math.round(spec.pxH*(2/297)));
  const scale=Math.min(spec.pxW/iw,(spec.pxH-TOP_PX)/ih);
  const rw=Math.max(1,Math.round(iw*scale)), rh=Math.max(1,Math.round(ih*scale));
  const left=Math.max(0,Math.round((spec.pxW-rw)/2));
  await pipe.resize({width:rw,height:rh,fit:'fill'}).extend({
    top:TOP_PX,bottom:Math.max(0,spec.pxH-TOP_PX-rh),
    left,right:Math.max(0,spec.pxW-left-rw),
    background:{r:255,g:255,b:255}
  }).jpeg({quality:96}).toFile(out);
  return out;
}

async function defaultPrinterName(){
  if(process.platform!=='win32') throw Error('Windows printer केवल Windows PC पर उपलब्ध है');
  return await new Promise((resolve,reject)=>{
    // Prefer Canon G2010 automatically so an approved QR order goes directly
    // to the G2010 when it is installed. If it is not found, use Windows'
    // default printer as before.
    const ps="$p=Get-CimInstance Win32_Printer | Where-Object {$_.Name -match 'G2010'} | Select-Object -First 1 -ExpandProperty Name; if(-not $p){$p=Get-CimInstance Win32_Printer | Where-Object {$_.Default -eq $true} | Select-Object -First 1 -ExpandProperty Name}; if($p){$p}";
    execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{windowsHide:true},(err,stdout,stderr)=>{
      if(err) return reject(Error('Canon G2010/Default printer नहीं मिल रहा: '+err.message));
      const name=String(stdout||'').trim();
      if(!name) return reject(Error('Windows में Canon G2010 या कोई Default Printer installed नहीं है'));
      resolve(name);
    });
  });
}

// Native Windows image printing: no SumatraPDF or MSPaint installation is required.
// PaperSize values are hundredths of an inch: A4 = 827 x 1169. Do not divide by 10.
// The image is first rendered by sharp to the selected paper size, then Windows
// .NET PrintDocument sends it directly to the default printer.
function windowsPrintImage(file,copies,paper,mode){return new Promise(async(resolve,reject)=>{
  try{
    const printable=await imageToPrintJpg(file,paper,mode);
    const printer=await defaultPrinterName();
    const spec=rasterPaperSpec(paper);
    const ps = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Drawing.Printing
$img = [System.Drawing.Image]::FromFile(${JSON.stringify(printable)})
$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings.PrinterName = ${JSON.stringify(printer)}
$pd.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('QRPrint', ${Math.round(spec.w)}, ${Math.round(spec.h)})
$pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)
$pd.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$pd.add_PrintPage({ param($sender,$e)
  $dest = $e.PageBounds
  $iw = $img.Width; $ih = $img.Height
  $scale = [Math]::Min($dest.Width / [double]$iw, $dest.Height / [double]$ih)
  $w = [int]($iw * $scale); $h = [int]($ih * $scale)
  # General print: ONLY 2 mm top offset. No left/right/bottom margin is added.
  # PrintDocument coordinates are 1/100 inch, so 2 mm = about 7.87 units.
  $top2mm = [int][Math]::Round(2 / 25.4 * 100)
  $x = [int](($dest.Width - $w) / 2); $y = $top2mm
  $e.Graphics.DrawImage($img, $x, $y, $w, $h)
})
for($i=0;$i -lt ${copies};$i++){ $pd.Print() }
$pd.Dispose(); $img.Dispose()
`;
    const encoded=Buffer.from(ps,'utf16le').toString('base64');
    execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',encoded],{windowsHide:true},(err,stdout,stderr)=>{
      try{fs.unlinkSync(printable)}catch{}
      if(err) return reject(Error(`Windows direct print failed: ${err.message}${stderr?` | ${stderr.trim()}`:''}`));
      resolve();
    });
  }catch(e){reject(e)}
})}

async function adobeExe(){
  if(process.platform!=='win32') throw Error('Adobe Acrobat केवल Windows PC पर उपलब्ध है');
  return await new Promise((resolve,reject)=>{
    const ps = String.raw`
$paths = @(
  (Get-Command Acrobat.exe -ErrorAction SilentlyContinue).Source,
  (Get-Command AcroRd32.exe -ErrorAction SilentlyContinue).Source,
  (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Acrobat.exe' -ErrorAction SilentlyContinue).'(default)',
  (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\Acrobat.exe' -ErrorAction SilentlyContinue).'(default)',
  (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\AcroRd32.exe' -ErrorAction SilentlyContinue).'(default)',
  (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\AcroRd32.exe' -ErrorAction SilentlyContinue).'(default)',
  (Join-Path $env:ProgramFiles 'Adobe\Acrobat\Acrobat.exe'),
  (Join-Path $env:ProgramFiles 'Adobe\Acrobat\Acrobat\Acrobat.exe'),
  (Join-Path $env:ProgramFiles 'Adobe\Acrobat DC\Acrobat\Acrobat.exe'),
  (Join-Path $env:ProgramFiles 'Adobe\Acrobat Reader\Reader\AcroRd32.exe'),
  (Join-Path $env:ProgramFiles 'Adobe\Acrobat Reader DC\Reader\AcroRd32.exe'),
  (Join-Path ${JSON.stringify(process.env['ProgramFiles(x86)']||'')} 'Adobe\Acrobat\Acrobat.exe'),
  (Join-Path ${JSON.stringify(process.env['ProgramFiles(x86)']||'')} 'Adobe\Acrobat DC\Acrobat\Acrobat.exe'),
  (Join-Path ${JSON.stringify(process.env['ProgramFiles(x86)']||'')} 'Adobe\Acrobat Reader\Reader\AcroRd32.exe'),
  (Join-Path ${JSON.stringify(process.env['ProgramFiles(x86)']||'')} 'Adobe\Acrobat Reader DC\Reader\AcroRd32.exe')
) | Where-Object { $_ -and (Test-Path $_) };
if(-not $paths){
  foreach($root in @($env:ProgramFiles, [Environment]::GetEnvironmentVariable('ProgramFiles(x86)'))){
    $adobe = Join-Path $root 'Adobe';
    if(Test-Path $adobe){
      $hit = Get-ChildItem -LiteralPath $adobe -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -in @('Acrobat.exe','AcroRd32.exe') } |
        Select-Object -First 1 -ExpandProperty FullName;
      if($hit){$paths=@($hit);break}
    }
  }
}
if($paths){ $paths | Select-Object -First 1 }
`;
    execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',ps],{windowsHide:true},(err,stdout,stderr)=>{
      const exe=String(stdout||'').trim().split(/\r?\n/)[0].trim();
      if(err || !exe || !fs.existsSync(exe)) return reject(Error('System में Adobe Acrobat/Reader नहीं मिला। Installed Adobe को automatic detect नहीं कर पाया।'));
      resolve(exe);
    });
  });
}
async function openPdfInAdobe(file){
  if(!fs.existsSync(file)) throw Error('PDF file नहीं मिला: '+file);
  const exe=await adobeExe();
  await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process -FilePath ${JSON.stringify(exe)} -ArgumentList ${JSON.stringify(file)}`],{windowsHide:true},err=>err?reject(Error('Adobe PDF खोल नहीं पाया: '+err.message)):resolve()));
}
async function adobePrint(file,copies,printer){
  if(!fs.existsSync(file)) throw Error('PDF file नहीं मिला: '+file);
  const exe=await adobeExe();
  // IMPORTANT: Do not wrap Adobe's /t print command inside Start-Process.
  // Start-Process often breaks quoted file/printer arguments when paths contain
  // spaces (for example "Program Files" or "Microsoft Print to PDF").
  // Calling Acrobat.exe directly through execFile preserves every argument.
  let lastError='';
  for(let i=0;i<copies;i++){
    try{
      await new Promise((resolve,reject)=>{
        execFile(exe,['/t',file,printer],{windowsHide:true,timeout:120000},(err,stdout,stderr)=>{
          if(err) return reject(Error(`Adobe /t print failed: ${err.message}${stderr?` | ${String(stderr).trim()}`:''}`));
          resolve();
        });
      });
      continue;
    }catch(e){
      lastError=e.message;
    }
    // Fallback: Windows' registered PDF Print verb. This is useful when the
    // installed Adobe build does not support /t reliably.
    try{
      await new Promise((resolve,reject)=>{
        const ps=`Start-Process -LiteralPath ${JSON.stringify(file)} -Verb Print -Wait -ErrorAction Stop`;
        execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',ps],{windowsHide:true,timeout:120000},(err,stdout,stderr)=>{
          if(err) return reject(Error(`Windows PDF Print verb failed: ${err.message}${stderr?` | ${String(stderr).trim()}`:''}`));
          resolve();
        });
      });
      continue;
    }catch(e){
      lastError += `; ${e.message}`;
    }
    throw Error(`Adobe PDF print failed. Adobe: ${exe}. Printer: ${printer}. ${lastError}`);
  }
}
async function windowsVerbPrint(file){
  if(!fs.existsSync(file)) throw Error('Print file नहीं मिला: '+file);
  await new Promise((resolve,reject)=>{
    const ps=`Start-Process -LiteralPath ${JSON.stringify(file)} -Verb Print -WindowStyle Hidden`;
    execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{windowsHide:true},err=>err?reject(err):resolve());
  });
}

function printOne(file,copies,mode,paper){return new Promise(async(resolve,reject)=>{try{
  const ext=path.extname(file).toLowerCase();
  if(!fs.existsSync(file)) return reject(Error('Print file नहीं मिला: '+file));
  const isImage=['.jpg','.jpeg','.png','.webp','.bmp'].includes(ext);
  const printMode=String(mode||'COLOR').toUpperCase()==='BW'?'BW':'COLOR';
  if(isImage){
    await windowsPrintImage(file,copies, paper, printMode);
    return resolve();
  }
  if(ext==='.pdf'){
    const printer=await defaultPrinterName();
    let printable=file, temp=null;
    // Apply the customer's selected print mode to PDFs too. COLOR keeps the
    // original PDF; BW creates a grayscale PDF before sending it to the printer.
    if(printMode==='BW'){
      const filtered=await filterPdfToPdf(file,'bw',{});
      printable=filtered.path; temp=filtered.path;
    }
    try{ await adobePrint(printable,copies,printer); }
    finally{ if(temp)try{fs.unlinkSync(temp)}catch{} }
    return resolve();
  }
  reject(Error('यह file type print के लिए supported नहीं है'));
}catch(e){reject(e)}})}

async function doPrint(o){const effectiveMode=o.type==='passport'?'COLOR':o.mode; for(const f of o.files){let p=f.path;if(!p&&f.url)p=path.join(UP,path.basename(f.url)); await printOne(p,o.copies,effectiveMode,o.paper)}}

async function performPrintForOrder(o, pageIndex=null){
  const effectiveMode=o.type==='passport'?'COLOR':o.mode;
  const originalMode=o.mode; o.mode=effectiveMode;
  const paths=orderFilePaths(o);
  if(!paths.length) throw Error('Print file नहीं मिला');
  for(const p of paths){
    if(!fs.existsSync(p)) throw Error('Print file नहीं मिला: '+p);
    if(pageIndex!==null && path.extname(p).toLowerCase()==='.pdf'){
      const one=await makePdfPageSubset(p,pageIndex);
      try{await printOne(one,o.copies,o.mode,o.paper)}finally{try{fs.unlinkSync(one)}catch{}}
    }else{
      await printOne(p,o.copies,o.mode,o.paper);
    }
  }
}
app.post('/api/orders/:id/settings',async(req,res)=>{
  const orders=read(); const o=orders.find(x=>x.id===req.params.id);
  if(!o)return res.status(404).json({error:'Order not found'});
  if(o.status!=='PENDING' && o.status!=='WAITING_NEXT')return res.status(400).json({error:'इस order की setting अब नहीं बदली जा सकती'});
  if(req.body.printMode==='ONE_BY_ONE'||req.body.printMode==='ALL') o.printMode=req.body.printMode;
  if(req.body.outputMode==='DIRECT_PRINT'||req.body.outputMode==='DOWNLOAD') o.outputMode=req.body.outputMode;
  if(o.type==='passport') o.mode='COLOR'; else if(req.body.colorMode==='BW'||req.body.colorMode==='COLOR') o.mode=req.body.colorMode;
  write(orders); res.json(o);
});
app.get('/api/orders/:id/download',async(req,res)=>{
  const orders=read(); const o=orders.find(x=>x.id===req.params.id);
  if(!o)return res.status(404).json({error:'Order not found'});
  const idx=Number.isInteger(Number(req.query.page))?Number(req.query.page):null;
  const p=orderFilePaths(o)[0];
  if(!p || !fs.existsSync(p))return res.status(404).json({error:'File नहीं मिला'});
  try{
    let file=p;
    if(idx!==null && path.extname(p).toLowerCase()==='.pdf'){
      if(idx<0)throw Error('Invalid page');
      const count=await getPdfPageCount(p); if(idx>=count)throw Error('Page not found');
      file=await makePdfPageSubset(p,idx);
    }
    res.download(file,path.basename(file),()=>{if(file!==p)try{fs.unlinkSync(file)}catch{}});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/orders/:id/approve-print',async(req,res)=>{
  const orders=read(); const o=orders.find(x=>x.id===req.params.id);
  if(!o)return res.status(404).json({error:'Order not found'});
  if(o.status!=='PENDING' && o.status!=='WAITING_NEXT')return res.status(400).json({error:'Already processed'});
  if(o.pageCount>1 && !o.printMode) o.printMode='ONE_BY_ONE';
  const output=req.body.outputMode||o.outputMode||'DIRECT_PRINT';
  const mode=req.body.printMode||o.printMode||(o.pageCount>1?'ONE_BY_ONE':'ALL');
  o.printMode=mode; o.outputMode=output;
  const page=o.currentPage||0;
  try{
    if(mode==='ALL'){
      if(output==='DOWNLOAD'){
        o.status='READY_DOWNLOAD'; o.approvedAt=Date.now(); write(orders);
        return res.json({...o,downloadUrl:'/api/orders/'+o.id+'/download'});
      }
      const start=o.currentPage||0;
      const paths=orderFilePaths(o);
      for(const p of paths){
        if(path.extname(p).toLowerCase()==='.pdf' && start>0){
          const remaining=await makePdfAllSubset(p,start);
          if(remaining){try{await printOne(remaining,o.copies,o.mode,o.paper)}finally{try{fs.unlinkSync(remaining)}catch{}}}
        }else await printOne(p,o.copies,o.mode,o.paper);
      }
      o.currentPage=o.pageCount||1; o.status='PRINTED'; o.printedAt=Date.now(); write(orders); return res.json(o);
    }
    // ONE_BY_ONE
    if(page>= (o.pageCount||1)){o.status='PRINTED';o.printedAt=Date.now();write(orders);return res.json(o)}
    if(output==='DOWNLOAD'){
      o.status='WAITING_NEXT'; o.currentPage=page+1; o.approvedAt=Date.now(); write(orders);
      return res.json({...o,downloadUrl:'/api/orders/'+o.id+'/download?page='+page});
    }
    await performPrintForOrder(o,page);
    o.currentPage=page+1;
    if(o.currentPage >= (o.pageCount||1)){o.status='PRINTED';o.printedAt=Date.now()}
    else {o.status='WAITING_NEXT';o.nextApprovalRequired=true}
    if(o.sides==='DUPLEX' && o.currentPage < (o.pageCount||1)) o.backApproval=true;
    write(orders); res.json(o);
  }catch(e){o.status='PRINT_ERROR';o.error=e.message;write(orders);res.status(500).json({error:e.message,order:o})}
});
app.post('/api/orders/:id/print',async(req,res)=>{
  const orders=read(); const o=orders.find(x=>x.id===req.params.id);
  if(!o)return res.status(404).json({error:'Order not found'});
  if(o.status!=='APPROVED' && o.status!=='WAITING_NEXT')return res.status(400).json({error:'पहले Approve करें'});
  try{
    const page=o.currentPage||0;
    if(o.printMode==='ALL') await performPrintForOrder(o,null);
    else await performPrintForOrder(o,page);
    if(o.printMode==='ALL'){o.currentPage=o.pageCount||1;o.status='PRINTED'}
    else {o.currentPage=page+1;o.status=o.currentPage>=(o.pageCount||1)?'PRINTED':'WAITING_NEXT'}
    o.printedAt=Date.now(); write(orders); res.json(o);
  }catch(e){o.status='PRINT_ERROR';o.error=e.message;write(orders);res.status(500).json({error:e.message,order:o})}
});
app.get('/api/stats',(req,res)=>{const o=read();const today=new Date();today.setHours(0,0,0,0);const t=o.filter(x=>x.createdAt>=today.getTime());res.json({orders:t.length,printed:t.filter(x=>x.status==='PRINTED').length,pending:t.filter(x=>x.status==='PENDING'||x.status==='WAITING_NEXT').length,waiting:t.filter(x=>x.status==='WAITING_NEXT').length,sales:t.filter(x=>x.status==='PRINTED').reduce((s,x)=>s+(x.price||0),0)})});
app.get('/api/health',(req,res)=>res.json({ok:true,platform:process.platform,hostname:os.hostname()}));
const PORT=3000; app.listen(PORT,'0.0.0.0',()=>console.log(`QR Se Print FINAL20 running: http://localhost:${PORT}`));
