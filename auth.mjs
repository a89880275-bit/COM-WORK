import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
export function accountUsers(settings){
 const names=new Map();for(const [team,people] of Object.entries(settings.people))for(const name of people)names.set(name,{name,team,role:'staff'});
 if(settings.teamLeaderName?.trim())names.set(settings.teamLeaderName.trim(),{name:settings.teamLeaderName.trim(),team:'전산팀',role:'leader'});
 names.set('이창주',{name:'이창주',team:names.get('이창주')?.team||'진료간호',role:'admin'});
 return [...names.values()].map(u=>({...u,departed:u.role!=='admin'&&(settings.departedNames||[]).includes(u.name)}));
}
export function loginUsers(settings){return accountUsers(settings).filter(u=>!u.departed).sort((a,b)=>Number(b.role==='leader')-Number(a.role==='leader'));}
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return {salt,hash:scryptSync(password,salt,32).toString('hex')};}
export function verifyPassword(password,record){if(typeof password!=='string'||password.length>128||!record)return false;return timingSafeEqual(scryptSync(password,record.salt,32),Buffer.from(record.hash,'hex'));}
export function syncAccounts(store){store.auth??={};for(const u of loginUsers(store.settings))if(!store.auth[u.name])store.auth[u.name]={...hashPassword('1'),version:1};}
