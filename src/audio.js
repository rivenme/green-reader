export function createAudio(enabled){
let AC=null;
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
function pause(){}
return { sndClick, sndCelebrate, sndDrop, pause };
}
