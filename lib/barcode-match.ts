export function normalizeScannedIdentifier(value:unknown){
  return String(value??'')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g,'')
    .trim()
    .toUpperCase();
}

export function matchesItemIdentifier(scanned:unknown,sku:string,barcodes:string[]){
  const candidate=normalizeScannedIdentifier(scanned);
  if(!candidate)return false;
  return candidate===normalizeScannedIdentifier(sku)
    ||barcodes.some(barcode=>candidate===normalizeScannedIdentifier(barcode));
}
