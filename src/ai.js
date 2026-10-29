// Cliente de IA: llama a la función del servidor (/api/ai), que guarda la clave de Gemini.
export function createAI(sb){
  async function call(task,payload,signal){
    const {data}=await sb.auth.getSession();
    const token=data&&data.session&&data.session.access_token;
    let res;
    try{
      res=await fetch("/api/ai",{method:"POST",signal,headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify(Object.assign({task},payload))});
    }catch(e){if(e&&e.name==="AbortError")throw e;throw {code:"unavailable",message:"Sin conexión"}}
    const body=await res.json().catch(()=>({}));
    if(res.status===429)throw {code:"rate_limited",message:body.error||"Límite alcanzado"};
    if(res.status===503)throw {code:"not_granted",message:body.error||"IA no configurada"};
    if(!res.ok)throw {code:"unavailable",message:body.error||("Error "+res.status)};
    return body;
  }
  return {
    classify:async names=>(await call("classify",{names})).result||{},
    identify:async desc=>(await call("identify",{desc})).result||null,
    analyze:async(payload,opts)=>(await call("analyze",payload,opts&&opts.signal)).text||""
  };
}
