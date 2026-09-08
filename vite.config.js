import { defineConfig } from 'vite';
export default defineConfig(({mode})=>({
  base: './',
  plugins: mode==='ios' ? [{
    name: 'bundled-ios-entry',
    transformIndexHtml(html){
      return html.replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
        .replace('<html lang="en">', '<html lang="en" class="nativeApp">');
    }
  }] : [],
  build: { sourcemap: true, rollupOptions: { output: { manualChunks: id => id.includes('/node_modules/three/') ? 'three' : undefined } } }
}));
