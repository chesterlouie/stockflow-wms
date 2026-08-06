import pg from 'pg';
const connectionString=process.env.DATABASE_ADMIN_URL,password=process.env.APP_DB_PASSWORD;
if(!connectionString||!password)throw new Error('DATABASE_ADMIN_URL and APP_DB_PASSWORD are required');
const client=new pg.Client({connectionString});
await client.connect();
try{
  const sql=(await client.query(`SELECT format('ALTER ROLE stockflow_app PASSWORD %L',$1::text) AS sql`,[password])).rows[0].sql;
  await client.query(sql);
  console.log('Application database role configured.');
}finally{await client.end()}
