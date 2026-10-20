import{c as n,a3 as h,Z as i,j as e,a4 as o}from"./index-BWRok0Sf.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=n("Copy",[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]);function v({score:a,orientation:l,loading:r}){const t=h(a),s=i(a).replace("+",""),c=a?a.mate!==void 0?a.mate>0:(a.cp??0)>=0:!0;return e.jsxs("div",{className:`evalbar ${l==="b"?"flipped":""} ${r?"loading":""}`,role:"meter","aria-valuemin":0,"aria-valuemax":100,"aria-valuenow":Math.round(t),"aria-label":`Avaliação: ${o(a)} (${i(a)})`,children:[e.jsx("div",{className:"evalbar-white",style:{height:`${t}%`}}),e.jsx("span",{className:`evalbar-label ${c?"w":"b"}`,children:s})]})}export{m as C,v as E};
