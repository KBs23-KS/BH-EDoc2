/**
 * PREVIEW-ONLY migration adapter for the REAL school application.
 * Unlike legacy App.jsx this path NEVER reads stored passwords in the browser,
 * never accepts a client-chosen Firebase UID/role, and never allows anonymous
 * Firebase Auth fallback.
 *
 * This is NOT sufficient on its own to protect Firestore: strict Rules,
 * private password storage and server-side document commands are prerequisites
 * to production enablement. OFF unless explicitly opted in for Preview.
 */
export const secureLoginPreviewEnabled=()=>
  import.meta.env?.VITE_BHS_SECURE_LOGIN_PREVIEW==="true";

async function sameOriginJson(fetcher,url,init={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),9500);
  try{
    const response=await fetcher(url,{
      method:init.method||"GET",
      headers:{"Accept":"application/json",...(init.headers||{})},
      credentials:"same-origin",
      cache:"no-store",
      signal:ctrl.signal,
      ...init
    });
    if(!response.ok)throw new Error("secure_session_unavailable");
    const data=await response.json();
    if(!data||typeof data!=="object")throw new Error("invalid_session_response");
    return data;
  }finally{clearTimeout(timer);}
}
export async function verifySchoolSession(fetcher){
  const data=await sameOriginJson(fetcher,"/api/app-session");
  if(data.success!==true||typeof data.userId!=="string"||!data.userId)
    throw new Error("invalid_school_session");
  return data.userId;
}
export async function createSchoolSession(fetcher,{username,password}){
  if(typeof username!=="string"||!username.trim()||username.length>120||
     typeof password!=="string"||!password||password.length>128)
    throw new Error("invalid_login_form");
  const data=await sameOriginJson(fetcher,"/api/app-session",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username:username.trim(),password,remember:true})
  });
  if(data.success!==true||typeof data.userId!=="string"||!data.userId)
    throw new Error("invalid_school_login");
  return data.userId;
}
export async function establishPrivateSchoolIdentity({fetcher,signIn,userId}){
  // Both APIs require the server-verified signed HttpOnly app cookie.
  const [identity,directory]=await Promise.all([
    sameOriginJson(fetcher,"/api/auth-identity"),
    sameOriginJson(fetcher,"/api/school-directory")
  ]);
  if(identity.uid!==userId||typeof identity.customToken!=="string"||
     identity.customToken.length<20)
    throw new Error("identity_mismatch");
  if(directory.success!==true||!Array.isArray(directory.users))
    throw new Error("invalid_school_directory");
  const users=directory.users;
  if(users.length>3000||users.some(x=>
    !x||typeof x.id!=="string"||typeof x.name!=="string"||
    !["admin","director","deputy","clerk","teacher"].includes(x.role)||
    Object.keys(x).some(key=>["password","passwordHash","secret","credentialTag"].includes(key))))
    throw new Error("unsafe_school_directory");
  const own=users.find(u=>u.id===userId&&u.status!=="inactive");
  if(!own)throw new Error("school_profile_missing");
  // Cannot infer the authenticated user from client-supplied login information.
  const result=await signIn(identity.customToken);
  if(result?.user?.uid!==userId||result?.user?.isAnonymous)
    throw new Error("signed_in_identity_mismatch");
  return {users,profile:own,firebaseUser:result.user};
}
