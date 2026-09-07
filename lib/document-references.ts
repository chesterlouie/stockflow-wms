type QueryClient={query:<T=any>(text:string,values?:unknown[])=>Promise<{rows:T[]}>};
const prefixes={store_request:'SRQ',store_return:'SRTN',store_transfer:'STRF',store_misc_issue:'SISS',store_count:'SCNT'}as const;
export type StoreDocumentType=keyof typeof prefixes;
export async function nextStoreReference(c:QueryClient,input:{companyId:string;storeId:string;storeCode:string;documentType:StoreDocumentType}){
  const period=new Date().toISOString().slice(0,7).replace('-',''),scope=input.storeCode.toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,20)||'STORE',values=[input.companyId,input.storeId,input.documentType,period];
  await c.query(`SELECT pg_advisory_xact_lock(hashtext($1||':'||$2||':'||$3||':'||$4))`,values);
  let row=(await c.query<{issued:string}>(`UPDATE document_sequences AS ds SET next_value=ds.next_value+1 WHERE ds.company_id=$1 AND ds.scope_id=$2 AND ds.document_type=$3 AND ds.period=$4 RETURNING (ds.next_value-1)::text AS issued`,values)).rows[0];
  if(!row)row=(await c.query<{issued:string}>(`INSERT INTO document_sequences(company_id,scope_id,document_type,period,next_value) VALUES($1,$2,$3,$4,2) RETURNING '1'::text AS issued`,values)).rows[0];
  if(!row)throw new Error('REFERENCE_SEQUENCE');return`${prefixes[input.documentType]}-${scope}-${period}-${row.issued.padStart(6,'0')}`;
}
