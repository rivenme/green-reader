// CI host diagnostic: exercise real WebGL and animation frames before the game.
import { firefox } from '@playwright/test';

const browser=await firefox.launch({headless:false});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.setContent('<canvas width="1280" height="720"></canvas>');
  const report=await page.evaluate(async()=>{
    const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl');
    const info={visibility:document.visibilityState,webgl:!!gl};
    if(!gl)return info;
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    info.renderer=gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER);
    info.version=gl.getParameter(gl.VERSION);
    function shader(type,source){
      const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
      return s;
    }
    const program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;void main(){gl_FragColor=vec4(0.,1.,0.,1.);}'));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,0,1]),gl.STATIC_DRAW);
    const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
    let frames=0,raf;
    const start=performance.now();
    function frame(){gl.drawArrays(gl.TRIANGLES,0,3);frames++;raf=requestAnimationFrame(frame);}
    frame();await new Promise(resolve=>setTimeout(resolve,2500));cancelAnimationFrame(raf);
    info.frames=frames;info.elapsedMs=Math.round(performance.now()-start);
    info.fps=Number((frames*1000/info.elapsedMs).toFixed(1));
    gl.drawArrays(gl.TRIANGLES,0,3);
    const pixel=new Uint8Array(4);gl.readPixels(640,360,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    info.pixel=Array.from(pixel);info.glError=gl.getError();
    return info;
  });
  console.log('Firefox rendering host:',JSON.stringify(report));
  if(!report.webgl||report.visibility!=='visible'||report.frames<2||report.pixel[1]!==255||report.glError!==0){
    throw new Error('Firefox host could not render an animated WebGL triangle. See the host report above.');
  }
}finally{await browser.close();}
