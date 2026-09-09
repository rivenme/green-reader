import { solveBestRoute } from './solver.js';
self.onmessage=({data})=>{
  const started=performance.now();
  try {
    const route=solveBestRoute(data.level,data.ball,data.options);
    const routes=data.compare?[route,solveBestRoute(data.level,data.ball,{...data.options,arrivalPace:'firm'})]:[];
    self.postMessage({id:data.id,route,routes,ms:performance.now()-started});
  }
  catch { self.postMessage({id:data.id,error:true}); }
};
