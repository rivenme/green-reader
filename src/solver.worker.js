import { solveBestRoute } from './solver.js';
self.onmessage=({data})=>{
  const started=performance.now();
  try { self.postMessage({id:data.id,route:solveBestRoute(data.level,data.ball,data.options),ms:performance.now()-started}); }
  catch { self.postMessage({id:data.id,error:true}); }
};
