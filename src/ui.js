export function announce(message){document.getElementById('announcer').textContent=message;}
export function createDialogs(onPause=()=>{}){
  let active=null,previous=null;
  function close(){
    if(!active)return;
    active.classList.add('hidden');active=null;
    document.getElementById('app').inert=false;onPause(false);
    if(previous?.isConnected)previous.focus();
  }
  function open(id,opener){
    if(active)close();previous=opener||document.activeElement;
    active=document.getElementById(id);active.classList.remove('hidden');
    document.getElementById('app').inert=true;onPause(true);
    (active.querySelector('button:not([hidden]):not(:disabled),a,input')||active).focus();
  }
  document.addEventListener('keydown',e=>{
    if(!active)return;
    if(e.key==='Escape' && active.dataset.dismissible!=='false'){e.preventDefault();close();return;}
    if(e.key==='Tab'){
      const items=[...active.querySelectorAll('button:not(:disabled),a[href],input,select,summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
      if(!items.length){e.preventDefault();return;}
      const first=items[0],last=items.at(-1);
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',close));
  return {open,close,isOpen:()=>!!active};
}
