/**
 * Loopback-only HTTP adapter for emulator-only backend command tests.
 * Not a Vercel function. Never deploy or expose to a public interface.
 */
import {createServer} from "node:http";

function answer(res,status,body){
  res.writeHead(status,{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store, private",
    "X-Content-Type-Options":"nosniff"
  });
  res.end(JSON.stringify(body));
}
export function createLoopbackEmulatorServer(service){
  if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8099"||
     typeof service?.execute!=="function")
    throw new Error("loopback_emulator_only");
  return createServer(async (req,res)=>{
    if(req.url!=="/test-only/command"||req.method!=="POST"){
      answer(res,404,{ok:false,code:"not_found"});return;
    }
    if(req.headers.origin&&![
      "http://localhost","http://127.0.0.1"
    ].some(x=>req.headers.origin===x||req.headers.origin.startsWith(x+":"))){
      answer(res,403,{ok:false,code:"origin_forbidden"});return;
    }
    if(!String(req.headers["content-type"]||"").toLowerCase().startsWith("application/json")){
      answer(res,415,{ok:false,code:"json_required"});return;
    }
    const header=String(req.headers.authorization||"");
    if(!/^Bearer \S{1,4096}$/.test(header)){
      answer(res,401,{ok:false,code:"missing_token"});return;
    }
    try{
      let bytes=0,raw="";
      for await(const chunk of req){
        bytes+=chunk.length;
        if(bytes>8192){answer(res,413,{ok:false,code:"request_too_large"});return;}
        raw+=chunk.toString("utf8");
      }
      let input;
      try{input=JSON.parse(raw);}
      catch{answer(res,400,{ok:false,code:"invalid_json"});return;}
      const result=await service.execute({
        idToken:header.slice(7),action:input?.action,
        docId:input?.docId,payload:input?.payload||{}
      });
      answer(res,200,result);
    }catch(error){
      // Never echo tokens, raw request body, Firestore error details or passwords.
      const status=[400,401,403,404,409,503].includes(error?.status)?
        error.status:500;
      answer(res,status,{ok:false,code:status===500?"internal_test_error":error.code});
    }
  });
}
