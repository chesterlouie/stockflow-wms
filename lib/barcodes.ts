import type { PoolClient } from "pg";

export type BarcodeFormat = "code128" | "ean13" | "upca" | "qr" | "gs1";

export function retailCheckDigit(payload: string) {
  const sum = [...payload].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

function nextRetailBarcode(previous: string | undefined, format: "ean13" | "upca", issued: string) {
  const totalLength = format === "ean13" ? 13 : 12;
  const payloadLength = totalLength - 1;
  const priorPayload = previous && /^\d+$/.test(previous) && previous.length === totalLength ? previous.slice(0, -1) : undefined;
  const nextValue = priorPayload ? BigInt(priorPayload) + 1n : BigInt(issued);
  const payload = nextValue.toString().padStart(payloadLength, "0");
  if (payload.length > payloadLength) throw new Error("BARCODE_SEQUENCE_EXHAUSTED");
  return payload + retailCheckDigit(payload);
}

export async function generateCompanyBarcode(client: PoolClient, companyId: string, format: BarcodeFormat) {
  const sequence = (await client.query<{ prefix: string; issued: string; pad_length: number }>(
    `UPDATE barcode_sequences SET next_value=next_value+1 WHERE company_id=$1 RETURNING prefix,(next_value-1)::text AS issued,pad_length`,
    [companyId],
  )).rows[0];
  if (!sequence) throw new Error("BARCODE_SEQUENCE_MISSING");
  if (format === "ean13" || format === "upca") {
    const previous = (await client.query<{ barcode_value: string }>(
      `SELECT barcode_value FROM item_barcodes WHERE company_id=$1 AND barcode_format=$2 AND barcode_value ~ '^[0-9]+$' ORDER BY created_at DESC,id DESC LIMIT 1`,
      [companyId, format],
    )).rows[0]?.barcode_value;
    return nextRetailBarcode(previous, format, sequence.issued);
  }
  return `${sequence.prefix}${sequence.issued.padStart(sequence.pad_length, "0")}`;
}
