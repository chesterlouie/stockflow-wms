type EmailInput={to:string;subject:string;html:string;text:string;idempotencyKey:string};
export function emailConfigured(){return Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM&&process.env.APP_URL)}
export async function sendEmail(input:EmailInput){
  if(!emailConfigured())return {sent:false,id:null};
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','User-Agent':'Warevanta-WMS/1.0','Idempotency-Key':input.idempotencyKey},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[input.to],subject:input.subject,html:input.html,text:input.text})});
  const body=await response.json() as {id?:string;message?:string};if(!response.ok||!body.id)throw new Error(body.message||`Email delivery failed (${response.status})`);return {sent:true,id:body.id};
}
export function escapeHtml(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}
