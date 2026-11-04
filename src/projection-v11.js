import * as THREE from 'three';
import { MASSES, BASES, PALETTE } from './installation-v11.js';
import { makeSolid } from './faces-v11.js';
import { VIEWS, makeMasterTexture } from './site-content.js';

// Permanent surface paint. No function here receives live camera state.
// Each physical triangle can belong to at most one artwork.
export function createInstallation(renderer) {
  const installation = new THREE.Group();
  // White plaster still needs light: unlit white erased every unprinted edge.
  const body = new THREE.MeshLambertMaterial({color:0xffffff});
  addPaperRelief(body);
  const solids=MASSES.map(m=>{
    const s=makeSolid(m,body);
    s.castShadow=true;
    s.receiveShadow=true;
    installation.add(s);return s;
  });
  const planeMeshes={}, bakeInfo={};
  const geometries=partitionFaces(solids);
  for(const view of VIEWS){
    const B=BASES[view.id], g=geometries[view.id];
    const depthTarget=bakeDepth(renderer,solids,B);
    const {texture}=makeMasterTexture(view,THREE,null,renderer);
    // The fixed printed reading faces stay flat and retain exact paper white.
    // Light belongs to the exposed connecting surfaces, not the composition.
    const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.FrontSide,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
    material.onBeforeCompile=shader=>{
      shader.uniforms.paintNormal={value:new THREE.Vector3(...B.normal)};
      shader.uniforms.paintDepthMap={value:depthTarget.depthTexture};
      shader.vertexShader='uniform vec3 paintNormal; varying float paintDepth;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        paintDepth=(119.9-dot(transformed,paintNormal))/399.9;`);
      shader.fragmentShader='uniform sampler2D paintDepthMap; varying float paintDepth;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        if(vMapUv.x<0. || vMapUv.x>1. || vMapUv.y<0. || vMapUv.y>1.) discard;
        float frontDepth=texture2D(paintDepthMap,vMapUv).r;
        for(int yy=-1;yy<=1;yy++) for(int xx=-1;xx<=1;xx++) {
          frontDepth=max(frontDepth,texture2D(paintDepthMap,vMapUv+vec2(float(xx),float(yy))/2048.).r);
        }
        if(paintDepth>frontDepth+max(.00008,1.2*fwidth(paintDepth))) discard;
        #include <map_fragment>
        if(diffuseColor.a<.01) discard;
      `);
    };
    material.customProgramCacheKey=()=> 'permanent-surface-paint-lit-v11';
    const mesh=new THREE.Mesh(g,material);mesh.name=`fixed-${view.id}`;
    installation.add(mesh);planeMeshes[view.id]=[mesh];
    bakeInfo[view.id]={triangles:g.attributes.position.count/3,depthTarget};
  }
  return {installation,solids,planeMeshes,bakeInfo};
}

// Anamorphic paper treatment: at a precise reading direction, normalize paper
// lighting to white so stray roofs and ring fascias do not spoil the flat page.
// Turning 2–14 degrees restores the fixed studio light and real shadow contrast.
// This changes shading only: every surface stays opaque, in place and painted.
// It is based on the actual view matrix, including free drag, not chapter state.
function addPaperRelief(material){
  const nearestReading=Object.values(BASES).map(B=>
    `alignment=max(alignment,dot(eye,vec3(${B.normal.map(n=>n.toFixed(8)).join(',')})));`
  ).join('\n');
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec3 eye=normalize(vec3(viewMatrix[0][2],viewMatrix[1][2],viewMatrix[2][2]));
      float alignment=-1.0;
      ${nearestReading}
      float relief=smoothstep(0.00061,0.02970,1.0-clamp(alignment,-1.0,1.0));
      outgoingLight=mix(vec3(1.0),outgoingLight,relief);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=> 'white-paper-relief-v11';
}

export function partitionFaces(solids){
  const out=Object.fromEntries(VIEWS.map(v=>[v.id,{p:[],uv:[]}])) ;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(const solid of solids){
    const pos=solid.geometry.attributes.position;
    for(let i=0;i<pos.count;i+=3){
      a.fromBufferAttribute(pos,i); b.fromBufferAttribute(pos,i+1); c.fromBufferAttribute(pos,i+2);
      const n=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      // Only faces parallel to a reading direction carry ink. Rounded roofs and
      // connective surfaces remain paper. Five disjoint normal families.
      const id=Object.keys(BASES).find(id=>n.dot(new THREE.Vector3(...BASES[id].normal))>.9999);
      if(!id) continue;
      const B=BASES[id], r=B.region;
      for(const p of [a,b,c]){
        out[id].p.push(...p.toArray());
        out[id].uv.push((p.dot(new THREE.Vector3(...B.right))-r.a[0])/(r.a[1]-r.a[0]),
          (p.dot(new THREE.Vector3(...B.up))-r.b[0])/(r.b[1]-r.b[0]));
      }
    }
  }
  return Object.fromEntries(Object.entries(out).map(([id,d])=>{
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(d.p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(d.uv,2));g.computeVertexNormals();return [id,g];
  }));
}
function bakeDepth(renderer,solids,B){
  const scene=new THREE.Scene(),m=new THREE.MeshBasicMaterial();
  solids.forEach(s=>scene.add(new THREE.Mesh(s.geometry,m)));
  const cam=new THREE.OrthographicCamera(B.region.a[0],B.region.a[1],B.region.b[1],B.region.b[0],.1,400);
  cam.up.set(...B.up);cam.position.set(...B.normal).multiplyScalar(120);cam.lookAt(0,0,0);cam.updateMatrixWorld();
  const N=2048,target=new THREE.WebGLRenderTarget(N,N,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
  target.depthTexture=new THREE.DepthTexture(N,N,THREE.UnsignedIntType);
  const previous=renderer.getRenderTarget();renderer.setRenderTarget(target);renderer.render(scene,cam);renderer.setRenderTarget(previous);m.dispose();
  return target;
}
