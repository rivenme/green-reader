function elevOf(L,fx,fy){
  let h=L.baseGrad.x*fx + L.baseGrad.y*fy;
  for(const b of L.bumps){
    const dx=fx-b.x, dy=fy-b.y;
    h += b.amp*Math.exp(-(dx*dx+dy*dy)/(2*b.sig*b.sig));
  }
  for(const f of (L.feats||[])){
    if(f.t==='tier'){
      const dd=(fx-f.x)*f.nx+(fy-f.y)*f.ny;
      const s=Math.min(1,Math.max(0, dd/f.w+0.5));
      h += f.amp*s*s*(3-2*s);                  // smoothstep ramp between tiers
    }else{                                     // ridge / spine (line gaussian)
      const dp=-(fx-f.x)*f.ny+(fy-f.y)*f.nx;
      h += f.amp*Math.exp(-dp*dp/(2*f.sig*f.sig));
    }
  }
  return h;
}
function gradOf(L,fx,fy){
  let gx=L.baseGrad.x, gy=L.baseGrad.y;
  for(const b of L.bumps){
    const dx=fx-b.x, dy=fy-b.y;
    const e=b.amp*Math.exp(-(dx*dx+dy*dy)/(2*b.sig*b.sig));
    gx += e*(-dx/(b.sig*b.sig));
    gy += e*(-dy/(b.sig*b.sig));
  }
  for(const f of (L.feats||[])){
    if(f.t==='tier'){
      const dd=(fx-f.x)*f.nx+(fy-f.y)*f.ny;
      const s=Math.min(1,Math.max(0, dd/f.w+0.5));
      const ds=f.amp*6*s*(1-s)/f.w;
      gx += ds*f.nx; gy += ds*f.ny;
    }else{
      const dp=-(fx-f.x)*f.ny+(fy-f.y)*f.nx;
      const e=f.amp*Math.exp(-dp*dp/(2*f.sig*f.sig));
      const dd=e*(-dp/(f.sig*f.sig));
      gx += dd*(-f.ny); gy += dd*(f.nx);
    }
  }
  return {x:gx,y:gy};
}

export { elevOf, gradOf };
