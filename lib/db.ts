import { Client, QueryResult, QueryResultRow } from "pg";

function connectionString() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not configured");
  return value;
}

async function connectedClient() {
  const client = new Client({ connectionString: connectionString() });
  await client.connect();
  return client;
}

export function db() {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
      const client = await connectedClient();
      try { return await client.query<T>(text, values); }
      finally { await client.end(); }
    },
  };
}

export async function withTransaction<T>(work: (client: Client) => Promise<T>) {
  const client = await connectedClient();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}

export async function withTenant<T>(companyId: string, work: (client: PoolClient) => Promise<T>) {
  return withTransaction(async (client) => {
    await client.query("SELECT set_config('app.company_id', $1, true)", [companyId]);
    return work(client);
  });
}

export async function tenantRows<T extends QueryResultRow>(companyId: string, text: string, values: unknown[] = []) {
  return withTenant(companyId, async (client) => (await client.query<T>(text, values)).rows);
}
