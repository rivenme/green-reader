import { installDiagnostics } from './diagnostics.js';
const diagnostics=installDiagnostics();
const status=document.getElementById('bootStatus');
const fallbackButton=document.getElementById('fallbackPlay');
fallbackButton.onclick=async()=>{const {startFallback}=await import('./fallback.js');startFallback();};
function fail(){
  document.getElementById('boot').classList.remove('hidden');
  status.textContent='The green could not load. Check that graphics acceleration is enabled, then try again.';
  document.getElementById('bootRetry').hidden=false;
}
document.getElementById('bootRetry').onclick=()=>location.reload();
try{
  const {startGame}=await import('./game.js');
  startGame();
  document.getElementById('boot').classList.add('hidden');
}catch(error){diagnostics.record('startup',error);console.error('Green Reader startup failed',error);status.textContent='3D graphics are unavailable in this browser. You can still practice with the 2D mode.';fallbackButton.hidden=false;fail();}
