export function createAudio(enabled){
let AC=null, rollSrc=null, rollGain=null, rollFlt=null;
function ac(){
  if(!enabled()) return null;
  if(!AC){
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio) return null;
    try { AC=new Audio(); } catch { return null; }
  }
  if(AC.state==='suspended') AC.resume().catch(()=>{});
  return AC;
}
function sndClick(power){
  const a=ac(); if(!a) return;
  const t=a.currentTime;
  const o=a.createOscillator(), g=a.createGain();
  o.type='triangle';
  o.frequency.setValueAtTime(900+600*power, t);
  o.frequency.exponentialRampToValueAtTime(300, t+0.04);
  g.gain.setValueAtTime(0.10+0.20*power, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t+0.05);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t+0.06);
}
function sndCelebrate(big){
  const a=ac(); if(!a) return;
  const t0=a.currentTime;
  const notes = big ? [523,659,784,1047] : [523,784];
  notes.forEach((f,i)=>{
    const o=a.createOscillator(), g=a.createGain();
    o.type='triangle'; o.frequency.value=f;
    const t=t0+i*0.07;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(0.16,t+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.18);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t+0.2);
  });
}
function sndDrop(){
  const a=ac(); if(!a) return;
  const t0=a.currentTime;
  [[260,0],[180,0.07]].forEach(([f,dt])=>{
    const o=a.createOscillator(), g=a.createGain();
    o.type='sine'; o.frequency.value=f;
    g.gain.setValueAtTime(0.18, t0+dt);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+dt+0.09);
    o.connect(g).connect(a.destination);
    o.start(t0+dt); o.stop(t0+dt+0.1);
  });
}
function ensureRollSound(){
  const a=ac(); if(!a||rollSrc) return;
  const len=a.sampleRate;
  const buf=a.createBuffer(1,len,a.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  rollSrc=a.createBufferSource(); rollSrc.buffer=buf; rollSrc.loop=true;
  rollFlt=a.createBiquadFilter(); rollFlt.type='lowpass'; rollFlt.frequency.value=300;
  rollGain=a.createGain(); rollGain.gain.value=0;
  rollSrc.connect(rollFlt); rollFlt.connect(rollGain); rollGain.connect(a.destination);
  rollSrc.start();
}


function update(speed, moving){
  if(!rollGain) return;
  const target=(enabled() && moving) ? Math.min(0.05,speed*0.008) : 0;
  rollGain.gain.value+=(target-rollGain.gain.value)*0.2;
  rollFlt.frequency.value=200+speed*60;
}
function pause(){ if(rollGain) rollGain.gain.value=0; }
return { sndClick, sndCelebrate, sndDrop, ensureRollSound, update, pause };
}
