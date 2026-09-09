export function createHaptics(enabled,{
  isNative=()=>globalThis.Capacitor?.isNativePlatform?.(),
  load=()=>import('@capacitor/haptics'),
}={}){
  let plugin;
  const fire=action=>{
    // Feedback is optional; an unsupported device must never interrupt a shot.
    try{
      if(!enabled() || !isNative())return;
      plugin??=Promise.resolve(load());
      return plugin.then(api=>{if(enabled())return action(api);}).catch(()=>{});
    }catch{}
  };
  return {strike:()=>fire(({Haptics,ImpactStyle})=>Haptics.impact({style:ImpactStyle.Light})),
    drop:()=>fire(({Haptics,NotificationType})=>Haptics.notification({type:NotificationType.Success}))};
}
