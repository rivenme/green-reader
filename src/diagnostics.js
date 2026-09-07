// Local diagnostics only. Nothing is transmitted automatically.
export function installDiagnostics(){
  const errors=[];
  function record(kind,error){
    errors.push({kind,message:String(error?.message||error).slice(0,500),time:new Date().toISOString()});
    if(errors.length>20)errors.shift();
  }
  window.addEventListener('error',e=>record('error',e.error||e.message));
  window.addEventListener('unhandledrejection',e=>record('promise',e.reason));
  document.getElementById('exportDiagnostics').onclick=()=>{
    const data={version:'1.0.0',browser:navigator.userAgent,viewport:[innerWidth,innerHeight],errors};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='green-reader-diagnostics.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return {record};
}
