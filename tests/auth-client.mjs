export function authenticatedClient(base){
 let cookie='',csrf='';
 async function login(){const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'이창주',password:'1'})});if(!response.ok)throw Error('테스트 관리자 로그인 실패');cookie=response.headers.get('set-cookie').split(';')[0];const state=await(await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json();csrf=state.token;}
 return async function clientFetch(url,options={}){if(!cookie)await login();return fetch(url,{...options,headers:{...options.headers,Cookie:cookie,...(options.method&&options.method!=='GET'?{'X-IT-Token':csrf}:{})}});};
}
