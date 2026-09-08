import { installDiagnostics } from './diagnostics.js';
const diagnostics=installDiagnostics();
const status=document.getElementById('bootStatus');
const fallbackButton=document.getElementById('fallbackPlay');
fallbackButton.onclick=async()=>{const {startFallback}=await import('./fallback.js');startFallback();};
function fail(message='The green could not load. Check that graphics acceleration is enabled, then try again.'){
  document.getElementById('boot').classList.remove('hidden');
  status.textContent=message;
  document.getElementById('bootRetry').hidden=false;
}
document.getElementById('bootRetry').onclick=()=>location.reload();
try{
  const {startGame}=await import('./game.js');
  startGame();
  fallbackButton.hidden=true;
  document.getElementById('boot').classList.add('hidden');
}catch(error){
  diagnostics.record('startup',error);
  console.error('Green Reader startup failed',error);
  fallbackButton.hidden=false;
  fail('3D graphics are unavailable in this browser. Starting 2D practice mode.');
  try{
    const {startFallback}=await import('./fallback.js');
    startFallback();
  }catch(fallbackError){
    diagnostics.record('fallback',fallbackError);
    console.error('Green Reader fallback failed',fallbackError);
  }
}
