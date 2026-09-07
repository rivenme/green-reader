import { installDiagnostics } from './diagnostics.js';
const diagnostics=installDiagnostics();
const status=document.getElementById('bootStatus');
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
}catch(error){diagnostics.record('startup',error);fail();}
