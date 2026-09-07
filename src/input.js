// Own exactly one pointer during a stroke. OrbitControls receives other gestures.
export function bindSlingshot(canvas,{canStart,hit,onStart,onMove,onRelease,onCancel}){
  let owner=null;
  function cancel(){
    const id=owner;owner=null;
    if(id!==null && canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
    onCancel();
  }
  canvas.addEventListener('pointerdown',e=>{
    if(owner!==null){e.stopImmediatePropagation();return;}
    if(e.button!==0 || !canStart())return;
    const point=hit(e);if(!point)return;
    e.stopImmediatePropagation();
    owner=e.pointerId;onStart(e,point);canvas.setPointerCapture(owner);
  },true);
  canvas.addEventListener('pointermove',e=>{
    if(e.pointerId!==owner)return;
    e.stopImmediatePropagation();onMove(e);
  },true);
  canvas.addEventListener('pointerup',e=>{
    if(e.pointerId!==owner)return;
    e.stopImmediatePropagation();onRelease(e);cancel();
  },true);
  for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{
    if(e.pointerId===owner)cancel();
  });
  return {cancel};
}
