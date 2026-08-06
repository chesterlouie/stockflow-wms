export async function GET(){return Response.json({service:"stockflow-wms",status:"ok",database:"postgresql",timestamp:new Date().toISOString()})}
