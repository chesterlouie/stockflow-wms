import {hashToken,randomToken} from './tokens';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes:Uint8Array){let bits=0,value=0,out='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out}
function decode(value:string){let bits=0,buffer=0;const out:number[]=[];for(const char of value.replace(/=|\s/g,'').toUpperCase()){const index=alphabet.indexOf(char);if(index<0)continue;buffer=(buffer<<5)|index;bits+=5;if(bits>=8){out.push((buffer>>>(bits-8))&255);bits-=8}}return new Uint8Array(out)}
export function newTotpSecret(){return base32(crypto.getRandomValues(new Uint8Array(20)))}
async function key(){const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(process.env.SESSION_SECRET||''));return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt'])}
export async function encryptSecret(secret:string){const iv=crypto.getRandomValues(new Uint8Array(12));const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(),new TextEncoder().encode(secret)));return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...data))}`}
export async function decryptSecret(value:string){const [a,b]=value.split('.');const iv=Uint8Array.from(atob(a),c=>c.charCodeAt(0)),data=Uint8Array.from(atob(b),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},await key(),data))}
async function totp(secret:string,counter:number){const bytes=new Uint8Array(8);new DataView(bytes.buffer).setBigUint64(0,BigInt(counter));const k=await crypto.subtle.importKey('raw',decode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);const digest=new Uint8Array(await crypto.subtle.sign('HMAC',k,bytes));const offset=digest[19]&15;const binary=((digest[offset]&127)<<24)|(digest[offset+1]<<16)|(digest[offset+2]<<8)|digest[offset+3];return String(binary%1000000).padStart(6,'0')}
export async function verifyTotp(secret:string,code:string){if(!/^\d{6}$/.test(code))return false;const now=Math.floor(Date.now()/30000);for(let d=-1;d<=1;d++)if(await totp(secret,now+d)===code)return true;return false}
export function otpauthUri(email:string,secret:string){return `otpauth://totp/Warevanta:${encodeURIComponent(email)}?secret=${secret}&issuer=Warevanta&digits=6&period=30`}
export function recoveryCodes(){return Array.from({length:8},()=>`${randomToken(4).toUpperCase()}-${randomToken(4).toUpperCase()}`)}
export {hashToken};
