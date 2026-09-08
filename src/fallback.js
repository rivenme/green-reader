import { GW, GH } from './constants.js';

// A deliberately simple no-WebGL mode. It preserves the core loop—read a
// target, choose pace, drag and release—when a browser blocks 3D contexts.
export function startFallback(){
  const boot=document.getElementById('boot');
  boot.classList.add('hidden');
  document.body.classList.add('fallbackMode');
  const stage=document.getElementById('stage');
  const old=stage.querySelector('canvas.fallbackCanvas');old?.remove();
  const canvas=document.createElement('canvas');canvas.className='fallbackCanvas';canvas.setAttribute('aria-label','2D putting practice green');stage.prepend(canvas);
  const ctx=canvas.getContext('2d');
  let dpr=1,ball={x:0.5,y:0.68},hole={x:0.5,y:0.25},aim=null,drag=false,shots=0,last='';
  const resize=()=>{dpr=Math.min(2,devicePixelRatio||1);canvas.width=innerWidth*dpr;canvas.height=innerHeight*dpr;canvas.style.width='100%';canvas.style.height='100%';draw();};
  const point=e=>({x:(e.clientX/innerWidth),y:(e.clientY/innerHeight)});
  const nearBall=p=>Math.hypot((p.x-ball.x)*innerWidth,(p.y-ball.y)*innerHeight)<52;
  const draw=()=>{ctx.setTransform(dpr,0,0,dpr,0,0);const w=innerWidth,h=innerHeight;ctx.fillStyle='#101710';ctx.fillRect(0,0,w,h);const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#a7c4a0');g.addColorStop(1,'#557d68');ctx.fillStyle=g;ctx.fillRect(0,h*.12,w,h*.88);ctx.strokeStyle='#ffffff33';ctx.lineWidth=1;for(let x=0;x<w;x+=48){ctx.beginPath();ctx.moveTo(x,h*.12);ctx.lineTo(x,h);ctx.stroke();}for(let y=h*.12;y<h;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}ctx.fillStyle='#14231a';ctx.beginPath();ctx.arc(hole.x*w,hole.y*h,12,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e54b45';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(hole.x*w,hole.y*h);ctx.lineTo(hole.x*w,hole.y*h-62);ctx.stroke();ctx.fillStyle='#e54b45';ctx.beginPath();ctx.moveTo(hole.x*w,hole.y*h-62);ctx.lineTo(hole.x*w+35,hole.y*h-50);ctx.lineTo(hole.x*w,hole.y*h-38);ctx.fill();if(aim){ctx.strokeStyle='#fff0a0';ctx.setLineDash([6,6]);ctx.beginPath();ctx.moveTo(ball.x*w,ball.y*h);ctx.lineTo(aim.x*w,aim.y*h);ctx.stroke();ctx.setLineDash([]);}ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ball.x*w,ball.y*h,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#102015dd';ctx.fillRect(16,16,300,76);ctx.fillStyle='#e8f0e6';ctx.font='600 16px system-ui';ctx.fillText('2D practice mode',32,44);ctx.font='13px system-ui';ctx.fillText(last||'Drag the ball away from the cup, then release.',32,68);};
  const release=()=>{if(!drag)return;drag=false;if(!aim)return;shots++;const power=Math.min(1,Math.hypot(aim.x-ball.x,aim.y-ball.y)*2.8);const dx=hole.x-ball.x,dy=hole.y-ball.y;const pace=Math.max(.08,Math.min(1,power));const nx=ball.x+dx*pace,ny=ball.y+dy*pace;const miss=Math.hypot(nx-hole.x,ny-hole.y);if(miss<.07){ball={...hole};last=`Holed in ${shots} · drag again to replay.`;}else{ball={x:Math.max(.08,Math.min(.92,nx)),y:Math.max(.16,Math.min(.92,ny))};last=`${(miss*40).toFixed(1)} ft away · try a little more or less power.`;}aim=null;draw();};
  canvas.addEventListener('pointerdown',e=>{const p=point(e);if(nearBall(p)){drag=true;canvas.setPointerCapture(e.pointerId);aim=p;draw();}});canvas.addEventListener('pointermove',e=>{if(drag){aim=point(e);draw();}});canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',()=>{drag=false;aim=null;draw();});window.addEventListener('resize',resize);resize();
}
