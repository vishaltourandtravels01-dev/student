
let uploaded=[]; let cropFile=null; let cropTarget='main'; let cropObjectUrl=null; const $=id=>document.getElementById(id);
$('type').onchange=()=>{
  const t=$('type').value;
  // Requested: changing print type clears all previously selected/uploaded/editor data.
  uploaded=[]; editorQueue=[]; croppedFront=null; croppedBack=null;
  renderFiles(); showSelectedPreview(null);
  $('files').value=''; $('front').value=''; $('back').value=''; $('panfile').value='';
  $('frontPreview').classList.add('hide'); $('backPreview').classList.add('hide'); $('panPreview').classList.add('hide'); $('idprev').classList.add('hide');
  $('frontStatus').textContent=''; $('backStatus').textContent=''; $('panStatus').textContent='';
  $('idbox').classList.toggle('hide',t!=='id'); $('panbox').classList.toggle('hide',t!=='pan');
  const general=t!=='id' && t!=='pan';
  $('files').closest('div').style.display=general?'':'none';
  $('docEditorNote').textContent='📑 '+$('type').options[$('type').selectedIndex].text+' — चुनी गई files पर Document Scanner की सभी settings लागू होंगी।';
  if(t==='document') $('files').accept='image/*,application/pdf,.pdf';
  else $('files').accept='image/*';
};
const canvas=$('cropCanvas'), ctx=canvas.getContext('2d');
let cropImgObj=new Image(),dispW=0,dispH=0,scaleX=1,scaleY=1;
let quad={nw:{x:0,y:0},ne:{x:0,y:0},sw:{x:0,y:0},se:{x:0,y:0}};
let drag=null,rotation=0,rotatedObjectUrl=null;
function drawCrop(){
  if(!cropImgObj.naturalWidth)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(cropImgObj,0,0,dispW,dispH);
  ctx.fillStyle='rgba(0,0,0,.50)';ctx.fillRect(0,0,dispW,dispH);
  ctx.save();
  ctx.beginPath();ctx.moveTo(quad.nw.x,quad.nw.y);ctx.lineTo(quad.ne.x,quad.ne.y);ctx.lineTo(quad.se.x,quad.se.y);ctx.lineTo(quad.sw.x,quad.sw.y);ctx.closePath();ctx.clip();
  ctx.drawImage(cropImgObj,0,0,dispW,dispH);ctx.restore();
  ctx.strokeStyle='#00e5ff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(quad.nw.x,quad.nw.y);ctx.lineTo(quad.ne.x,quad.ne.y);ctx.lineTo(quad.se.x,quad.se.y);ctx.lineTo(quad.sw.x,quad.sw.y);ctx.closePath();ctx.stroke();
  const hs=14;ctx.fillStyle='#fff';Object.values(quad).forEach(p=>ctx.fillRect(p.x-hs/2,p.y-hs/2,hs,hs));
}
function syncFields(){
  const minX=Math.min(quad.nw.x,quad.ne.x,quad.sw.x,quad.se.x),minY=Math.min(quad.nw.y,quad.ne.y,quad.sw.y,quad.se.y);
  const maxX=Math.max(quad.nw.x,quad.ne.x,quad.sw.x,quad.se.x),maxY=Math.max(quad.nw.y,quad.ne.y,quad.sw.y,quad.se.y);
  $('cx').value=Math.round(minX*scaleX);$('cy').value=Math.round(minY*scaleY);$('cw').value=Math.max(1,Math.round((maxX-minX)*scaleX));$('ch').value=Math.max(1,Math.round((maxY-minY)*scaleY));
}
function setupCropCanvas(){
  const nw=cropImgObj.naturalWidth,nh=cropImgObj.naturalHeight;if(!nw||!nh)return;
  const maxW=Math.max(280,Math.min(window.innerWidth-70,820)),maxH=Math.max(220,Math.min(window.innerHeight*0.58,620));
  const k=Math.min(maxW/nw,maxH/nh,1);dispW=Math.max(1,Math.round(nw*k));dispH=Math.max(1,Math.round(nh*k));
  canvas.width=dispW;canvas.height=dispH;canvas.style.width=dispW+'px';canvas.style.height=dispH+'px';scaleX=nw/dispW;scaleY=nh/dispH;
  quad={nw:{x:0,y:0},ne:{x:dispW,y:0},sw:{x:0,y:dispH},se:{x:dispW,y:dispH}};syncFields();drawCrop();
  $('cropHint').textContent='👆 चारों कोनों को अलग-अलग खींचें। जितना हिस्सा select होगा, उतना ही सीधा करके final photo बनेगा।';
}
function openCrop(file,target){cropFile=file;cropTarget=target;rotation=0;if(cropObjectUrl)URL.revokeObjectURL(cropObjectUrl);if(rotatedObjectUrl)URL.revokeObjectURL(rotatedObjectUrl);cropObjectUrl=URL.createObjectURL(file);cropImgObj.onload=setupCropCanvas;cropImgObj.src=cropObjectUrl;$('rotationInfo').textContent='Rotation: 0°';$('cropModal').classList.remove('hide');}
async function rotateCrop(deg){
  if(!cropImgObj.naturalWidth)return;rotation=(rotation+deg+360)%360;const src=cropImgObj,c=document.createElement('canvas'),swap=Math.abs(rotation)%180===90;
  c.width=swap?src.naturalHeight:src.naturalWidth;c.height=swap?src.naturalWidth:src.naturalHeight;const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.translate(c.width/2,c.height/2);x.rotate(rotation*Math.PI/180);x.drawImage(src,-src.naturalWidth/2,-src.naturalHeight/2);
  const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Rotation image नहीं बन पाई')),'image/jpeg',0.98));if(rotatedObjectUrl)URL.revokeObjectURL(rotatedObjectUrl);rotatedObjectUrl=URL.createObjectURL(blob);cropImgObj.onload=setupCropCanvas;cropImgObj.src=rotatedObjectUrl;$('rotationInfo').textContent='Rotation: '+rotation+'°';
}
function renderFiles(){
  const box=$('filelist');
  if(!box)return;
  box.innerHTML='';
  if(!uploaded.length){
    box.innerHTML='<div class=\"small\">अभी कोई edited file तैयार नहीं है।</div>';
    return;
  }
  const wrap=document.createElement('div');
  wrap.className='uploaded-list';
  uploaded.forEach((f,i)=>{
    const row=document.createElement('div');
    row.className='uploaded-row';
    const isPdf=f.mime==='application/pdf'||String(f.name||'').toLowerCase().endsWith('.pdf');
    const icon=isPdf?'📄':'🖼️';
    row.innerHTML='<span>'+icon+' '+(f.name||('File '+(i+1)))+'</span>';
    const actions=document.createElement('div');
    actions.className='row';
    const view=document.createElement('button');
    view.type='button'; view.className='blue'; view.textContent='👁️ Review';
    view.onclick=()=>showResultPreview(f);
    const del=document.createElement('button');
    del.type='button'; del.className='red'; del.textContent='✕ Remove';
    del.onclick=()=>{uploaded.splice(i,1);renderFiles();if(uploaded.length)showResultPreview(uploaded[uploaded.length-1]);else showSelectedPreview(null);};
    actions.appendChild(view); actions.appendChild(del); row.appendChild(actions); wrap.appendChild(row);
  });
  box.appendChild(wrap);
}

function clearPreviewUrl(){if(window.selectedPreviewUrl){try{URL.revokeObjectURL(window.selectedPreviewUrl)}catch{}window.selectedPreviewUrl=null;}}
function showSelectedPreview(file){const box=$('selectedPreview');clearPreviewUrl();if(!file){box.classList.add('hide');box.innerHTML='';return;}window.selectedPreviewUrl=URL.createObjectURL(file);box.classList.remove('hide');box.innerHTML='<div class="previewlabel">👁️ चुनी हुई फाइल का Preview</div>';const isPdf=file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf');if(file.type.startsWith('image/')){const img=document.createElement('img');img.src=window.selectedPreviewUrl;img.alt=file.name;box.appendChild(img);}else if(isPdf){const iframe=document.createElement('iframe');iframe.src=window.selectedPreviewUrl;iframe.title='PDF Preview';box.appendChild(iframe);}}
function paperClass(p){return String(p||'A4').toUpperCase()==='A4'?'a4':'p46';}
function paperLabel(p){return String(p||'A4').toUpperCase()==='A4'?'A4':'4×6';}
async function showResultPreview(x){const box=$('selectedPreview');clearPreviewUrl();box.classList.remove('hide');box.innerHTML='<div class="previewlabel">✅ '+(x.name||'File')+' — Review Preview</div><div class="small">Selected paper पर preview तैयार हो रहा है…</div>';try{if(x.mime&&x.mime.startsWith('image/')){const paper=$('paper').value||'A4';const img=document.createElement('img');img.className='paperimg';img.src=x.url+'?preview='+Date.now();img.alt=x.name||'preview';const frame=document.createElement('div');frame.className='paperpreview '+paperClass(paper);frame.appendChild(img);const cap=document.createElement('div');cap.className='papercaption';cap.textContent='📄 '+paperLabel(paper)+' page • ऊपर से सिर्फ 2 mm';box.innerHTML='<div class="previewlabel">✅ Edit के बाद Review Preview</div>';box.appendChild(frame);box.appendChild(cap);img.onload=()=>{const maxH=frame.clientHeight-(frame.clientHeight*(2/(paper==='A4'?297:152.4)));const naturalRatio=img.naturalHeight?img.naturalWidth/img.naturalHeight:1;const frameRatio=frame.clientWidth/frame.clientHeight;let w=frame.clientWidth,h=w/naturalRatio;if(h>maxH){h=maxH;w=h*naturalRatio;}img.style.width=Math.round(w)+'px';img.style.height=Math.round(h)+'px';img.style.left=Math.round((frame.clientWidth-w)/2)+'px';img.style.top=Math.round(frame.clientHeight*(2/(paper==='A4'?297:152.4)))+'px';};return;}const frame=document.createElement('div');frame.className='paperpreview '+paperClass($('paper').value||'A4');const iframe=document.createElement('iframe');iframe.src=x.url+'#zoom=page-fit';iframe.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;border:0;background:#fff;filter:'+(filterDefs[x.filter||'normal']||'none')+';';frame.appendChild(iframe);box.innerHTML='<div class="previewlabel">✅ PDF — Review Preview</div>';box.appendChild(frame);}catch(e){box.innerHTML+='<div class="small">⚠️ Preview load नहीं हुआ।</div>';}}
$('paper').addEventListener('change',()=>{if(uploaded.length)showResultPreview(uploaded[0]);});

// -------- Document Scanner style editor --------
let editorQueue=[],editorFile=null,editorOriginal=null,editorTarget='main',editorAdjust={brightness:100,contrast:100,saturation:100,temperature:0,exposure:0,sharpness:0,shadows:0,highlights:0,bw:0},editorCanvas=$('docCanvas'),editorCtx=editorCanvas.getContext('2d'),editorImg=new Image(),editorFilter='normal',editorRotation=0,editorPdf=false,editorPdfMeta=null,editorErasing=false,editorEraseDown=false;
const filterDefs={normal:'none',soft:'brightness(1.04) contrast(.96) saturate(.9)',sharp:'contrast(1.35) brightness(.98) saturate(.75)',bw:'grayscale(1) contrast(1.18)',carbon:'grayscale(1) contrast(1.65) brightness(.9)',gray:'grayscale(1)'};
function adjustCss(a=editorAdjust){const b=a.brightness/100,c=a.contrast/100,s=a.saturation/100,e=1+a.exposure/100,t=a.temperature;const sep=t>0?`sepia(${Math.min(.45,t/110)})`:t<0?`hue-rotate(${t/8}deg) saturate(${Math.max(.7,1+t/160)})`:'';const bw=a.bw/100;return `brightness(${b*e}) contrast(${c}) saturate(${s}) ${sep} grayscale(${bw})`; }
function resetAdjustments(){editorAdjust={brightness:100,contrast:100,saturation:100,temperature:0,exposure:0,sharpness:0,shadows:0,highlights:0,bw:0}; syncAdjustUI(); if(editorPdf){$('docPdf').style.filter=(filterDefs[editorFilter]||'none')+' '+adjustCss();} else drawEditorImage();}
function syncAdjustUI(){for(const [k,v] of Object.entries(editorAdjust)){const el=$('adj'+k.charAt(0).toUpperCase()+k.slice(1));const out=$(el?.id+'Val');if(el)el.value=v;if(out)out.textContent=k==='brightness'||k==='contrast'||k==='saturation'||k==='bw'?v+'%':v;} }
function adjustmentPayload(){return {...editorAdjust};}

function blobUrl(blob){return URL.createObjectURL(blob)}
function drawEditorImage(){if(!editorImg.naturalWidth)return;const max=1600,k=Math.min(max/editorImg.naturalWidth,max/editorImg.naturalHeight,1);let w=Math.max(1,Math.round(editorImg.naturalWidth*k)),h=Math.max(1,Math.round(editorImg.naturalHeight*k));if(Math.abs(editorRotation)%180===90)[w,h]=[h,w];editorCanvas.width=w;editorCanvas.height=h;editorCanvas.style.filter='none';editorCtx.save();editorCtx.filter=(filterDefs[editorFilter]&&editorFilter!=='normal'?filterDefs[editorFilter]:'none'); if(editorAdjust){editorCtx.filter=(editorFilter!=='normal'?filterDefs[editorFilter]+' ':'')+adjustCss();}editorCtx.fillStyle='#fff';editorCtx.fillRect(0,0,w,h);editorCtx.translate(w/2,h/2);editorCtx.rotate(editorRotation*Math.PI/180);editorCtx.drawImage(editorImg,-editorImg.naturalWidth*k/2,-editorImg.naturalHeight*k/2,editorImg.naturalWidth*k,editorImg.naturalHeight*k);editorCtx.filter='none';editorCtx.restore();}
function openDocumentEditor(file,target='main'){editorFile=file;editorOriginal=file;editorTarget=target;editorPdf=file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf');editorFilter='normal';editorRotation=0;editorErasing=false;editorPdfMeta=null;resetAdjustments();$('docEditorName').textContent=file.name+' — '+(editorPdf?'PDF':'Photo');$('filterMenu').classList.add('hide');$('adjustMenu').classList.add('hide');$('selectedFilterAdjustLabel').classList.add('hide');$('docPdf').classList.toggle('hide',!editorPdf);$('docCanvas').classList.toggle('hide',editorPdf);$('docEditor').classList.remove('hide');if(editorPdf){const u=URL.createObjectURL(file);$('docPdf').src=u;$('docPdf').style.filter=filterDefs[editorFilter]||'none';editorPdfMeta={url:u};$('docEditorNote').textContent='PDF Editor: Rotate / Watermark / Signature / Eraser / Color Filter सभी tools उपलब्ध हैं। PDF filter preview browser में लागू होगा; Save पर original PDF सुरक्षित रखा जाएगा और B&W filters print mode में भी दर्ज होंगे।';}else{const u=URL.createObjectURL(file);editorImg.onload=()=>drawEditorImage();editorImg.src=u;$('docEditorNote').textContent='Photo में Crop, Rotate, Color Filter, Eraser, Signature और Watermark सभी tools उपलब्ध हैं।';}}
function canvasToBlob(){return new Promise((resolve,reject)=>editorCanvas.toBlob(b=>b?resolve(b):reject(Error('Edited image तैयार नहीं हुई')),'image/jpeg',.96));}
function promptWatermark(){const t=prompt('Watermark text लिखें:','QR se Print');if(!t)return;editorCtx.save();editorCtx.globalAlpha=.28;editorCtx.fillStyle='#111827';editorCtx.font=Math.max(18,editorCanvas.width/24)+'px Arial';editorCtx.textAlign='center';editorCtx.translate(editorCanvas.width/2,editorCanvas.height/2);editorCtx.rotate(-Math.PI/8);editorCtx.fillText(t,0,0);editorCtx.restore();}
function signatureDialog(){const wrap=document.createElement('div');wrap.className='modal';wrap.innerHTML='<div class="modalbox" style="max-width:620px"><h2>✍️ Signature</h2><p class="small">नीचे उंगली/स्टाइलस से signature बनाएं।</p><canvas class="signature-pad" id="sigPad"></canvas><div class="row" style="margin-top:8px"><button class="red" id="sigClear">Clear</button><button class="green" id="sigUse">Use Signature</button></div></div>';document.body.appendChild(wrap);const c=wrap.querySelector('#sigPad'),x=c.getContext('2d');let down=false,last=null;function p(e){const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height}}c.width=900;c.height=300;c.addEventListener('pointerdown',e=>{down=true;last=p(e);c.setPointerCapture(e.pointerId)});c.addEventListener('pointermove',e=>{if(!down)return;const q=p(e);x.strokeStyle='#111827';x.lineWidth=5;x.lineCap='round';x.beginPath();x.moveTo(last.x,last.y);x.lineTo(q.x,q.y);x.stroke();last=q});c.addEventListener('pointerup',()=>down=false);wrap.querySelector('#sigClear').onclick=()=>x.clearRect(0,0,c.width,c.height);wrap.querySelector('#sigUse').onclick=()=>{const u=c.toDataURL('image/png'),im=new Image();im.onload=()=>{const w=Math.min(editorCanvas.width*.35,420),h=w*(im.height/im.width);editorCtx.drawImage(im,editorCanvas.width-w-20,editorCanvas.height-h-20,w,h);wrap.remove()};im.src=u;};}
$('edFilter').onclick=()=>{const opening=$('filterMenu').classList.toggle('hide')===false;if(opening){$('adjustMenu').classList.remove('hide');$('selectedFilterAdjustLabel').classList.remove('hide');syncAdjustUI();}};document.querySelectorAll('#filterMenu button').forEach(b=>b.onclick=()=>{editorFilter=b.dataset.filter;$('selectedFilterAdjustLabel').textContent='🎨 '+b.textContent+' चुना गया — नीचे Color Adjust से इसी filter को fine-tune करें';$('selectedFilterAdjustLabel').classList.remove('hide');$('adjustMenu').classList.remove('hide');syncAdjustUI();if(editorPdf){$('docPdf').style.filter=(filterDefs[editorFilter]||'none')+' '+adjustCss();$('mode').value=(editorFilter==='normal'||editorFilter==='soft'||editorFilter==='sharp')?'COLOR':'BW';$('docEditorNote').textContent='✅ PDF पर '+b.textContent+' preview लागू है। नीचे Color Adjust से brightness/contrast आदि बदल सकते हैं। Save & Continue पर दोनों changes साथ में लागू होंगे।';}else drawEditorImage();});
$('edAdjust').onclick=()=>{$('adjustMenu').classList.toggle('hide');$('selectedFilterAdjustLabel').classList.toggle('hide',$('adjustMenu').classList.contains('hide'));syncAdjustUI();};
['Brightness','Contrast','Saturation','Temperature','Exposure','Sharpness','Shadows','Highlights','BW'].forEach(k=>{const el=$('adj'+k);if(el)el.addEventListener('input',()=>{const key=k.charAt(0).toLowerCase()+k.slice(1);editorAdjust[key]=Number(el.value);const out=$(el.id+'Val');if(out)out.textContent=(['brightness','contrast','saturation','bw'].includes(key)?el.value+'%':el.value);if(editorPdf){$('docPdf').style.filter=(filterDefs[editorFilter]||'none')+' '+adjustCss();}else drawEditorImage();});});
$('adjReset').onclick=()=>resetAdjustments();

$('edRotate').onclick=()=>{if(editorPdf){applyPdfEdit({rotate:90}).then(openEditedPdf).catch(e=>alert(e.message));}else{editorRotation=(editorRotation+90)%360;drawEditorImage();}};
$('edWatermark').onclick=()=>{if(editorPdf){const t=prompt('PDF watermark text:','QR se Print');if(t)applyPdfEdit({watermark:t}).then(openEditedPdf).catch(e=>alert(e.message));}else promptWatermark();};
$('edSignature').onclick=()=>{if(editorPdf){alert('PDF में Signature लगाने के लिए पहले Signature image चुनें/बनाएं।');signatureDialogPdf();}else signatureDialog();};
$('edEraser').onclick=()=>{if(editorPdf){const p=prompt('PDF page number और white box (x%,y%,w%,h%) दें, जैसे: 1,10,10,20,10');if(p)applyPdfEdit({erase:p}).then(openEditedPdf).catch(e=>alert(e.message));}else{editorErasing=!editorErasing;editorCanvas.classList.toggle('erase-cursor',editorErasing);$('docEditorNote').textContent=editorErasing?'🧽 Eraser ON: photo पर drag करके white area हटाएँ।':'Eraser OFF';}};
editorCanvas.addEventListener('pointerdown',e=>{if(!editorErasing)return;editorEraseDown=true;editorCanvas.setPointerCapture(e.pointerId);eraseAt(e)});editorCanvas.addEventListener('pointermove',e=>{if(editorEraseDown)eraseAt(e)});editorCanvas.addEventListener('pointerup',()=>editorEraseDown=false);
function eraseAt(e){const r=editorCanvas.getBoundingClientRect(),x=(e.clientX-r.left)*editorCanvas.width/r.width,y=(e.clientY-r.top)*editorCanvas.height/r.height;editorCtx.fillStyle='#fff';editorCtx.beginPath();editorCtx.arc(x,y,Math.max(12,editorCanvas.width/45),0,Math.PI*2);editorCtx.fill();}
$('edReset').onclick=()=>{if(editorPdf){editorFilter='normal';$('docPdf').style.filter='none';if(editorFile){$('docPdf').src=URL.createObjectURL(editorOriginal)}$('mode').value='COLOR';}else{editorFilter='normal';editorRotation=0;editorErasing=false;resetAdjustments();$('filterMenu').classList.add('hide');$('adjustMenu').classList.add('hide');$('selectedFilterAdjustLabel').classList.add('hide');drawEditorImage();}};
async function loadPdfJs(){
  if(window.pdfjsLib)return window.pdfjsLib;
  if(window.__pdfJsPromise)return window.__pdfJsPromise;
  window.__pdfJsPromise=new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=()=>{try{window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';resolve(window.pdfjsLib)}catch(e){reject(e)}};s.onerror=()=>reject(Error('PDF Scanner engine load नहीं हुआ। Internet connection check करें।'));document.head.appendChild(s);
  });
  return window.__pdfJsPromise;
}
async function renderPdfPageToBlob(pdf,pageNo=1,scale=1.6){
  const pdfjs=await loadPdfJs();const data=pdf instanceof File?await pdf.arrayBuffer():await (await fetch(pdf.url)).arrayBuffer();
  const doc=await pdfjs.getDocument({data}).promise;const page=await doc.getPage(pageNo);const vp=page.getViewport({scale});
  const c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
  return {canvas:c,width:vp.width,height:vp.height,count:doc.numPages,doc};
}
async function pdfFourCornerCrop(){
  if(!editorFile)throw Error('PDF नहीं है');
  const first=await renderPdfPageToBlob(editorFile,1,1.7);
  cropPdfMeta={doc:first.doc,pageCount:first.count,firstCanvas:first.canvas};
  const blob=await new Promise((res,rej)=>first.canvas.toBlob(b=>b?res(b):rej(Error('PDF page render नहीं हुई')),'image/jpeg',.96));
  cropFile=new File([blob],'pdf-page-1.jpg',{type:'image/jpeg'});cropTarget=editorTarget||'main';rotation=0;
  if(cropObjectUrl)URL.revokeObjectURL(cropObjectUrl);cropObjectUrl=URL.createObjectURL(blob);cropImgObj.onload=setupCropCanvas;cropImgObj.src=cropObjectUrl;$('rotationInfo').textContent='PDF 4-Corner Crop';$('cropHint').textContent='📄 PDF Page 1 को 4 corners से select करें। Apply करने पर यही crop सभी PDF pages पर उनके अपने size के अनुसार लगेगा।';$('cropModal').classList.remove('hide');
}
async function applyPdfFourCorner(){
  const doc=cropPdfMeta&&cropPdfMeta.doc;if(!doc)throw Error('PDF crop session नहीं मिला');
  const src=[quad.nw,quad.ne,quad.se,quad.sw];const baseW=dispW,baseH=dispH;
  const norm=src.map(p=>({x:p.x/baseW,y:p.y/baseH}));
  const imgs=[];
  for(let i=1;i<=doc.numPages;i++){
    const page=await doc.getPage(i),vp=page.getViewport({scale:1.7});const c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
    const img=new Image();const u=URL.createObjectURL(await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('PDF page render failed')),'image/jpeg',.96)));await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=u});
    const q=norm.map(p=>({x:p.x*c.width,y:p.y*c.height}));const saveQuad=quad;quad={nw:q[0],ne:q[1],se:q[2],sw:q[3]};const oldImg=cropImgObj;cropImgObj=img;const oldDispW=dispW,oldDispH=dispH,oldScaleX=scaleX,oldScaleY=scaleY;dispW=c.width;dispH=c.height;scaleX=1;scaleY=1;const b=await perspectiveCrop();imgs.push(b);quad=saveQuad;cropImgObj=oldImg;dispW=oldDispW;dispH=oldDispH;scaleX=oldScaleX;scaleY=oldScaleY;URL.revokeObjectURL(u);
  }
  const fd=new FormData();imgs.forEach((b,i)=>fd.append('pages',b,`page-${i+1}.jpg`));const r=await fetch('/api/pdf-from-images',{method:'POST',body:fd});const x=await r.json();if(!r.ok||x.error)throw Error(x.error||'PDF 4-corner crop failed');return x;
}
let cropPdfMeta=null;
$('edCrop').onclick=async()=>{try{if(editorPdf){await pdfFourCornerCrop();}else{const b=editorCanvas.toDataURL('image/jpeg',.96);const blob=await (await fetch(b)).blob();openCrop(new File([blob],'editor-photo.jpg',{type:'image/jpeg'}),editorTarget||'main');}}catch(e){alert(e.message)}};
$('edCancel').onclick=()=>{$('docEditor').classList.add('hide');editorFile=null;$('docPdf').style.filter='none';};
window.__saveEditorAndContinue=async()=>{try{if(!editorFile)throw Error('File नहीं है');const target=editorTarget||'main';if(editorPdf){$('docEditor').classList.add('hide');if(editorPdf && Object.values(editorAdjust).some((v,i)=>v!==[100,100,100,0,0,0,0,0,0][i])){const z=await applyPdfEdit({filter:editorFilter,adjust:adjustmentPayload()});editorFile=z;} await finalizeUploadedFile(editorFile,{filter:editorFilter,target});$('docPdf').style.filter='none';return true;}const b=await canvasToBlob();const f=new File([b],(editorFile.name||'photo').replace(/\.[^.]+$/,'')+'-edited.jpg',{type:'image/jpeg'});$('docEditor').classList.add('hide');await finalizeUploadedFile(f,{filter:editorFilter,target});return true;}catch(e){alert(e.message);return false}};
$('edApply').onclick=()=>window.__saveEditorAndContinue();
async function finalizeUploadedFile(file,meta={}){
  if(!file)return;
  const target=meta.target||editorTarget||'main';
  const isPdf=file.type==='application/pdf'||String(file.name||'').toLowerCase().endsWith('.pdf');
  // FINAL30 passport flow: after all scanner edits, generate the original 6-photo A4 passport layout.
  if($('type').value==='passport'){
    if(isPdf) throw Error('📸 पासपोर्ट फोटो के लिए JPG/PNG फोटो चुनें, PDF नहीं');
    const fd=new FormData();
    let blob=file;
    if(file instanceof File){ blob=file; }
    else { const rr=await fetch(file.url); blob=await rr.blob(); }
    fd.append('photo',blob,'passport-source-'+Date.now()+'.jpg');
    const rr=await fetch('/api/passport-layout',{method:'POST',body:fd});
    const px=await rr.json();
    if(!rr.ok||px.error) throw Error(px.error||'Passport A4 layout failed');
    px.filter=meta.filter||'normal';
    uploaded=[px];
    renderFiles();
    $('msg').textContent='✅ 6 Passport Photos A4 में तैयार हैं — Review में देखें';
    await showResultPreview(px);
    if(editorQueue.length)processNextEditor();
    return;
  }
  // PAN / Identity Card: after all scanner edits, place the edited card at
  // the real 85.60 x 53.98 mm size on an A4 page.
  if($('type').value==='pan'){
    if(isPdf) throw Error('💳 PAN/Identity Card के लिए JPG/PNG photo चुनें');
    const fd=new FormData();
    const blob=file instanceof File ? file : await (await fetch(file.url)).blob();
    fd.append('file',blob,'pan-identity-'+Date.now()+'.jpg');
    const rr=await fetch('/api/card-layout',{method:'POST',body:fd});
    const px=await rr.json();
    if(!rr.ok||px.error) throw Error(px.error||'PAN/Identity Card A4 layout failed');
    px.filter=meta.filter||'normal';
    uploaded=[px]; renderFiles();
    // PAN/Identity Card dedicated preview: show the generated A4 layout directly.
    $('panPreview').src=px.url+'?preview='+Date.now();
    $('panPreview').classList.remove('hide');
    $('panStatus').textContent='✅ Card edited and A4 actual-size layout तैयार है — Preview नीचे देखें';
    await showResultPreview(px);
    return;
  }
  let x;
  if(isPdf){
    if(file instanceof File){const xs=await uploadFiles([file]);x=xs[0];}
    else{x=file;}
  }else{x=await uploadBlobAsFile(file,file.name||('edited-'+Date.now()+'.jpg'));}
  x.filter=meta.filter||'normal';
  if(target==='front'){
    croppedFront=x;$('frontStatus').textContent='✅ Front — सभी Document Scanner settings लग गईं';$('frontPreview').src=x.url;$('frontPreview').classList.remove('hide');
  }else if(target==='back'){
    croppedBack=x;$('backStatus').textContent='✅ Back — सभी Document Scanner settings लग गईं';$('backPreview').src=x.url;$('backPreview').classList.remove('hide');
  }else{
    uploaded.push(x);renderFiles();await showResultPreview(x);
  }
  if(editorQueue.length)processNextEditor();
}
function processNextEditor(){if(!editorQueue.length)return;const f=editorQueue.shift();if(f.type&&f.type.startsWith('image/'))openCrop(f,'main');else openDocumentEditor(f,'main');}
function startEditorQueue(files){editorQueue=files.slice();uploaded=[];renderFiles();processNextEditor();}
async function openEditedPdf(x){editorFile=x;editorPdf=true;editorOriginal=x;const u=x.url+'?t='+Date.now();$('docPdf').src=u;$('docPdf').style.filter=filterDefs[editorFilter]||'none';}
async function applyPdfEdit(payload){if(!editorFile)throw Error('PDF नहीं है');const fd=new FormData();const pdfBlob=editorFile instanceof File?editorFile:await (await fetch(editorFile.url)).blob();fd.append('file',pdfBlob,'document.pdf');fd.append('action',JSON.stringify(payload));const r=await fetch('/api/pdf-edit',{method:'POST',body:fd});const x=await r.json();if(!r.ok||x.error)throw Error(x.error||'PDF edit failed');return x;}
function signatureDialogPdf(){const wrap=document.createElement('div');wrap.className='modal';wrap.innerHTML='<div class="modalbox" style="max-width:620px"><h2>✍️ PDF Signature</h2><p class="small">नीचे signature बनाएं; यह सभी PDF pages पर नीचे दाईं तरफ लगेगा।</p><canvas class="signature-pad" id="sigPdf"></canvas><div class="row" style="margin-top:8px"><button class="red" id="sc">Clear</button><button class="green" id="su">Apply to PDF</button></div></div>';document.body.appendChild(wrap);const c=wrap.querySelector('#sigPdf'),x=c.getContext('2d');c.width=900;c.height=300;let d=false,l;const p=e=>{const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height}};c.onpointerdown=e=>{d=true;l=p(e);c.setPointerCapture(e.pointerId)};c.onpointermove=e=>{if(!d)return;const q=p(e);x.strokeStyle='#111827';x.lineWidth=5;x.lineCap='round';x.beginPath();x.moveTo(l.x,l.y);x.lineTo(q.x,q.y);x.stroke();l=q};c.onpointerup=()=>d=false;wrap.querySelector('#sc').onclick=()=>x.clearRect(0,0,c.width,c.height);wrap.querySelector('#su').onclick=async()=>{try{const data=c.toDataURL('image/png'),blob=await (await fetch(data)).blob(),pdfBlob=editorFile instanceof File?editorFile:await (await fetch(editorFile.url)).blob(),fd=new FormData();fd.append('file',pdfBlob,'document.pdf');fd.append('signature',blob,'signature.png');fd.append('action',JSON.stringify({signature:true}));const rr=await fetch('/api/pdf-edit',{method:'POST',body:fd}),z=await rr.json();if(!rr.ok||z.error)throw Error(z.error||'PDF signature failed');wrap.remove();openEditedPdf(z);}catch(e){alert(e.message)}};}
$('files').onchange=async()=>{const chosen=Array.from($('files').files||[]);if(!chosen.length)return;try{for(const f of chosen){if(!(f.type.startsWith('image/')||f.type==='application/pdf'||f.name.toLowerCase().endsWith('.pdf')))throw Error('केवल Photo या PDF चुनें');}showSelectedPreview(chosen[0]);$('filelist').textContent=chosen.map(x=>x.name).join(' | ');startEditorQueue(chosen);}catch(e){alert(e.message)}};
$('cancelCrop').onclick=()=>{$('cropModal').classList.add('hide');$('files').value='';if(rotatedObjectUrl){URL.revokeObjectURL(rotatedObjectUrl);rotatedObjectUrl=null;}};
$('fitCrop').onclick=()=>{if(cropImgObj.naturalWidth)setupCropCanvas();};$('rotateLeft').onclick=()=>rotateCrop(-90);$('rotateRight').onclick=()=>rotateCrop(90);window.addEventListener('resize',()=>{if(!$('cropModal').classList.contains('hide')&&cropImgObj.naturalWidth)setupCropCanvas();});
function pos(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(dispW,e.clientX-r.left)),y:Math.max(0,Math.min(dispH,e.clientY-r.top))};}
function hitHandle(p){const hs=24,pts={nw:quad.nw,ne:quad.ne,sw:quad.sw,se:quad.se};for(const[k,v]of Object.entries(pts))if(Math.hypot(p.x-v.x,p.y-v.y)<=hs)return k;return null;}
function pointInQuad(p){const pts=[quad.nw,quad.ne,quad.se,quad.sw];let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const xi=pts[i].x,yi=pts[i].y,xj=pts[j].x,yj=pts[j].y,inter=((yi>p.y)!=(yj>p.y))&&(p.x<(xj-xi)*(p.y-yi)/(yj-yi)+xi);if(inter)inside=!inside;}return inside;}
canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);const p=pos(e),h=hitHandle(p);if(h)drag={mode:h,sx:p.x,sy:p.y,orig:JSON.parse(JSON.stringify(quad))};else if(pointInQuad(p))drag={mode:'move',sx:p.x,sy:p.y,orig:JSON.parse(JSON.stringify(quad))};else drag=null;});
canvas.addEventListener('pointermove',e=>{if(!drag)return;e.preventDefault();const p=pos(e),o=drag.orig;if(drag.mode==='move'){const dx=p.x-drag.sx,dy=p.y-drag.sy;Object.keys(quad).forEach(k=>{quad[k]={x:Math.max(0,Math.min(dispW,o[k].x+dx)),y:Math.max(0,Math.min(dispH,o[k].y+dy))};});}else{quad[drag.mode]={x:p.x,y:p.y};}syncFields();drawCrop();});canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
['cx','cy','cw','ch'].forEach(id=>$(id).addEventListener('input',()=>{}));
function solveHomography(src,dst){let A=[],b=[];for(let i=0;i<4;i++){const X=src[i].x,Y=src[i].y,u=dst[i].x,v=dst[i].y;A.push([X,Y,1,0,0,0,-u*X,-u*Y]);b.push(u);A.push([0,0,0,X,Y,1,-v*X,-v*Y]);b.push(v);}for(let i=0;i<8;i++){let m=i;for(let r=i+1;r<8;r++)if(Math.abs(A[r][i])>Math.abs(A[m][i]))m=r;[A[i],A[m]]=[A[m],A[i]];[b[i],b[m]]=[b[m],b[i]];const piv=A[i][i]||1e-12;for(let c=i;c<8;c++)A[i][c]/=piv;b[i]/=piv;for(let r=0;r<8;r++)if(r!==i){const f=A[r][i];if(!f)continue;for(let c=i;c<8;c++)A[r][c]-=f*A[i][c];b[r]-=f*b[i];}}return [...b,1];}
function invMap(H,u,v){const d=H[6]*u+H[7]*v+1;return{x:(H[0]*u+H[1]*v+H[2])/d,y:(H[3]*u+H[4]*v+H[5])/d};}
async function perspectiveCrop(){
  const src=[quad.nw,quad.ne,quad.se,quad.sw],top=Math.hypot(src[1].x-src[0].x,src[1].y-src[0].y),bottom=Math.hypot(src[2].x-src[3].x,src[2].y-src[3].y),left=Math.hypot(src[3].x-src[0].x,src[3].y-src[0].y),right=Math.hypot(src[2].x-src[1].x,src[2].y-src[1].y);
  const outW=Math.max(1,Math.round(Math.max(top,bottom)*scaleX)),outH=Math.max(1,Math.round(Math.max(left,right)*scaleY));
  const maxPixels=4500000,fac=Math.min(1,Math.sqrt(maxPixels/(outW*outH)));const W=Math.max(1,Math.round(outW*fac)),Hh=Math.max(1,Math.round(outH*fac));
  const canvasOut=document.createElement('canvas');canvasOut.width=W;canvasOut.height=Hh;const octx=canvasOut.getContext('2d');const img=cropImgObj,iw=img.naturalWidth,ih=img.naturalHeight;
  const hom=solveHomography([{x:0,y:0},{x:W-1,y:0},{x:W-1,y:Hh-1},{x:0,y:Hh-1}],src.map(p=>({x:p.x*scaleX,y:p.y*scaleY})));
  const data=octx.createImageData(W,Hh),d=data.data;
  const tmp=document.createElement('canvas');tmp.width=iw;tmp.height=ih;const tctx=tmp.getContext('2d',{willReadFrequently:true});tctx.drawImage(img,0,0,iw,ih);const sd=tctx.getImageData(0,0,iw,ih).data;
  for(let y=0;y<Hh;y++)for(let x=0;x<W;x++){const q=invMap(hom,x,y),sx=Math.max(0,Math.min(iw-1,q.x)),sy=Math.max(0,Math.min(ih-1,q.y)),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(iw-1,x0+1),y1=Math.min(ih-1,y0+1),fx=sx-x0,fy=sy-y0,i=(y*W+x)*4;for(let c=0;c<4;c++){const a=sd[(y0*iw+x0)*4+c],b=sd[(y0*iw+x1)*4+c],cc=sd[(y1*iw+x0)*4+c],e=sd[(y1*iw+x1)*4+c];d[i+c]=a*(1-fx)*(1-fy)+b*fx*(1-fy)+cc*(1-fx)*fy+e*fx*fy;}}octx.putImageData(data,0,0);
  return new Promise((resolve,reject)=>canvasOut.toBlob(b=>b?resolve(b):reject(Error('4-corner crop image नहीं बन पाई')),'image/jpeg',0.96));
}
async function uploadBlobAsFile(blob,name){const fd=new FormData();fd.append('files',blob,name);const r=await fetch('/api/upload',{method:'POST',body:fd});const x=await r.json();if(!r.ok||x.error)throw Error(x.error||'Upload failed');return x.files[0];}
async function uploadFiles(files){const fd=new FormData();files.forEach(f=>fd.append('files',f));const r=await fetch('/api/upload',{method:'POST',body:fd});const x=await r.json();if(!r.ok||x.error)throw Error(x.error||'Upload failed');return x.files||[];}
$('applyCrop').onclick=async()=>{try{if(cropPdfMeta){const x=await applyPdfFourCorner();cropPdfMeta=null;$('cropModal').classList.add('hide');openEditedPdf(x);return;}if(!cropFile||!cropImgObj.naturalWidth)throw Error('Photo अभी तैयार नहीं हुई');const blob=await perspectiveCrop();const f=new File([blob],'cropped-4corner-'+Date.now()+'.jpg',{type:'image/jpeg'});$('cropModal').classList.add('hide');if(cropTarget==='editor'){openDocumentEditor(f,editorTarget||'main');return;}if(cropTarget==='front'){openDocumentEditor(f,'front');return;}if(cropTarget==='back'){openDocumentEditor(f,'back');return;}openDocumentEditor(f,'main');}catch(e){alert(e.message)}};
async function chooseAndCropId(input,status){const f=input.files[0];if(!f)return;try{const fd=new FormData();fd.append('file',f);const r=await fetch('/api/upload',{method:'POST',body:fd});const x=await r.json();if(x.error)throw Error(x.error);status.textContent='Selected: '+f.name;}catch(e){alert(e.message)}}
let frontPreviewUrl=null, backPreviewUrl=null;
function showIdPreview(input,imgId,statusId){
  const f=input.files && input.files[0]; const img=$(imgId); const st=$(statusId);
  if(!f){img.classList.add('hide'); img.removeAttribute('src'); st.textContent=''; return;}
  if(!f.type.startsWith('image/')){img.classList.add('hide'); st.textContent='⚠️ केवल image file चुनें'; return;}
  if(imgId==='frontPreview' && frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
  if(imgId==='backPreview' && backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
  const u=URL.createObjectURL(f); if(imgId==='frontPreview') frontPreviewUrl=u; else backPreviewUrl=u;
  img.src=u; img.classList.remove('hide'); img.onload=()=>{st.textContent='✅ Selected preview';}; img.onerror=()=>{st.textContent='⚠️ Preview load नहीं हुआ';};
}
$('panfile').onchange=async()=>{
  const f=$('panfile').files[0]; if(!f)return;
  if(!f.type.startsWith('image/')){alert('PAN/Identity Card के लिए JPG/PNG photo चुनें');$('panfile').value='';return;}
  $('panStatus').textContent='📑 Document Scanner Editor खुल रहा है...';
  editorTarget='main';
  openCrop(f,'main');
};
$('front').onchange=()=>{const f=$('front').files[0];showIdPreview($('front'),'frontPreview','frontStatus');if(f)openCrop(f,'front');};
$('back').onchange=()=>{const f=$('back').files[0];showIdPreview($('back'),'backPreview','backStatus');if(f)openCrop(f,'back');};
let croppedFront=null,croppedBack=null;
// For ID photos, use the same crop modal and store the cropped result locally before creating the final layout.
$('makeid').onclick=async()=>{try{if(!croppedFront||!croppedBack)throw Error('पहले Front और Back दोनों photo select करके Crop & Add करें');const get=async x=>{const r=await fetch(x.url);const b=await r.blob();return b};const fd=new FormData();fd.append('front',await get(croppedFront),'front.jpg');fd.append('back',await get(croppedBack),'back.jpg');const r=await fetch('/api/id-layout',{method:'POST',body:fd});const x=await r.json();if(x.error)throw Error(x.error);uploaded=[x];$('idprev').src=x.url;$('idprev').classList.remove('hide');await showResultPreview(x);alert('ID Front + Back A4 पर Actual Aadhaar Size में तैयार है — Print में 100% / Actual Size रखें');}catch(e){alert(e.message)}};
$('submit').onclick=async()=>{try{if(!uploaded.length){const t=$('type').value;if(t==='id'){if(!(croppedFront&&croppedBack))throw Error('Aadhaar/ID के लिए Front और Back दोनों तैयार करें।');}else{const ready=await ensureSelectedFilesReady();if(!ready)throw Error('पहले Photo/PDF file चुनें।');}}const ok=confirm('Final Print से पहले कृपया सब settings check करें\n\nPage Size: '+$('paper').value+'\nCopies: '+$('copies').value+'\nColor: '+$('mode').value+'\nSides: '+$('sides').value+'\nPayment: '+$('pay').value+'\n\nReview में crop की हुई photo सही दिख रही है?\nOK = सही है, order भेजें\nCancel = वापस जाकर बदलें');if(!ok)return;const body={name:$('name').value,phone:$('phone').value,type:$('type').value,files:uploaded.map(f=>({path:f.path,url:f.url,name:f.name,mime:f.mime,filter:f.filter||'normal'})),mode:$('mode').value,copies:$('copies').value,paper:$('paper').value,sides:$('sides').value,paymentMode:$('pay').value,price:$('price').value};const r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const o=await r.json();if(o.error)throw Error(o.error);$('msg').innerHTML='<b>Order #'+o.id+' भेज दिया गया है। दुकान से approval का इंतजार करें.</b>';uploaded=[];editorQueue=[];croppedFront=null;croppedBack=null;editorFile=null;editorTarget='main';renderFiles();showSelectedPreview(null);$('files').value='';$('front').value='';$('back').value='';$('panfile').value='';$('filelist').textContent='';$('frontStatus').textContent='';$('backStatus').textContent='';$('panStatus').textContent='';$('frontPreview').classList.add('hide');$('frontPreview').removeAttribute('src');$('backPreview').classList.add('hide');$('backPreview').removeAttribute('src');$('panPreview').classList.add('hide');$('panPreview').removeAttribute('src');$('idprev').classList.add('hide');$('idprev').removeAttribute('src');}catch(e){alert(e.message)}};

// Wizard file-preparation helper. It accepts a selected file immediately and, when possible,
// preserves any Scanner Editor/crop work already in progress.
async function ensureSelectedFilesReady(){
  if(uploaded.length) return true;
  const input=$('files');
  const chosen=Array.from(input?.files||[]);
  if(!chosen.length) return false;
  try{
    const editorOpen=!$('docEditor')?.classList.contains('hide');
    if(editorOpen && editorFile && typeof window.__saveEditorAndContinue==='function'){
      const ok=await window.__saveEditorAndContinue();
      if(!ok) return false;
    }
    const cropOpen=!$('cropModal')?.classList.contains('hide');
    if(cropOpen && cropFile){
      const blob=await perspectiveCrop();
      const f=new File([blob],'cropped-4corner-'+Date.now()+'.jpg',{type:'image/jpeg'});
      $('cropModal').classList.add('hide');
      openDocumentEditor(f,'main');
      if(typeof window.__saveEditorAndContinue==='function'){
        const ok=await window.__saveEditorAndContinue();
        if(!ok) return false;
      }
    }
    // If there are other selected files, prepare them according to the selected print type.
    // Passport/PAN must go through their existing A4 layout APIs; normal document/photo files
    // can be uploaded directly.
    if(!uploaded.length){
      const t=$('type')?.value||'document';
      if(t==='passport' || t==='pan'){
        for(const f of chosen){
          await finalizeUploadedFile(f,{filter:'normal',target:'main'});
          if(uploaded.length) break;
        }
      }else{
        const xs=await uploadFiles(chosen);
        xs.forEach(x=>{x.filter=x.filter||'normal';uploaded.push(x)});
        renderFiles();
        if(uploaded[0]) await showResultPreview(uploaded[0]);
      }
    }
    return uploaded.length>0;
  }catch(e){
    alert(e.message||'File तैयार नहीं हो सकी।');
    return false;
  }
}

// ===== v15 PRO 6-STEP WIZARD — keeps all existing feature logic intact =====
(function(){
  const cards=[1,2,3,4,5,6].map(n=>document.getElementById('step'+n));
  const progress=[...document.querySelectorAll('#wizardProgress .step')];
  let current=1;
  function review(){
    const type=document.getElementById('type');
    const typeText=type?.options[type.selectedIndex]?.text||'-';
    const files=(document.getElementById('filelist')?.textContent||'').trim() || (document.getElementById('files')?.files?.length ? [...document.getElementById('files').files].map(f=>f.name).join(', ') : 'अभी फाइल तैयार नहीं');
    const vals=[
      ['📄 प्रिंट प्रकार',typeText],
      ['📂 फाइल',files],
      ['🎨 रंग',document.getElementById('mode')?.options[document.getElementById('mode').selectedIndex]?.text||'-'],
      ['📑 पेपर',document.getElementById('paper')?.value||'-'],
      ['🖨️ कॉपी',document.getElementById('copies')?.value||'-'],
      ['↔️ प्रिंट तरीका',document.getElementById('sides')?.options[document.getElementById('sides').selectedIndex]?.text||'-'],
      ['👤 नाम',document.getElementById('name')?.value||'—'],
      ['📱 मोबाइल',document.getElementById('phone')?.value||'—'],
      ['💳 भुगतान',document.getElementById('pay')?.options[document.getElementById('pay').selectedIndex]?.text||'-'],
      ['💰 अनुमानित शुल्क','₹ '+(document.getElementById('price')?.value||'0')]
    ];
    const box=document.getElementById('reviewBox'); if(box) box.innerHTML=vals.map(v=>`<div class="review-item"><span>${v[0]}</span><b>${v[1]}</b></div>`).join('');
  }
  function show(n){
    current=Math.max(1,Math.min(6,n));
    cards.forEach((c,i)=>c?.classList.toggle('active',i+1===current));
    progress.forEach((p,i)=>{p.classList.toggle('active',i+1===current);p.classList.toggle('done',i+1<current)});
    if(current===5) review();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function canNext(n){
    if(n===2){
      const t=document.getElementById('type')?.value;
      if(t==='id'){
        const frontSelected=!!document.getElementById('front')?.files?.length;
        const backSelected=!!document.getElementById('back')?.files?.length;
        if(!(croppedFront&&croppedBack) && !(frontSelected&&backSelected)){
          alert('कृपया Aadhaar/ID का Front और Back दोनों चुनें।');return false;
        }
      }else if(!uploaded.length){
        const ok=await ensureSelectedFilesReady();
        if(!ok){alert('कृपया पहले Photo/PDF file चुनें।');return false;}
      }
    }
    if(n===4){
      const name=document.getElementById('name')?.value.trim(), phone=document.getElementById('phone')?.value.trim();
      if(!name){alert('कृपया अपना नाम दर्ज करें।');return false;}
      if(!/^\d{10}$/.test(phone)){alert('कृपया 10 अंकों का मोबाइल नंबर दर्ज करें।');return false;}
    }
    return true;
  }
  document.querySelectorAll('.nextBtn').forEach(b=>b.addEventListener('click',async()=>{const n=Number(b.dataset.next);if(await canNext(n))show(n)}));
  document.querySelectorAll('.backBtn').forEach(b=>b.addEventListener('click',()=>show(Number(b.dataset.back))));
  progress.forEach((p,i)=>p.addEventListener('click',()=>{if(i+1<=current)show(i+1)}));
  document.querySelectorAll('input,select').forEach(el=>el.addEventListener('change',()=>{if(current===5)review()}));
  const pay=document.getElementById('pay');
  document.querySelectorAll('input[name="payChoice"]').forEach(r=>r.addEventListener('change',()=>{if(pay)pay.value=r.value}));
  pay?.addEventListener('change',()=>{const r=document.querySelector(`input[name="payChoice"][value="${pay.value}"]`);if(r)r.checked=true});
  // Keep the existing form/submit logic untouched; wizard only controls visibility.
  show(1);
})();
