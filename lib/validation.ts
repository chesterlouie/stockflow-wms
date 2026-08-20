import { z } from "zod";

export const signupSchema = z.object({
  company: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).max(128),
});

export const signinSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const itemSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(250),
  category: z.string().trim().max(120).optional(),
  status: z.enum(["active", "blocked", "discontinued"]),
  uom: z.string().trim().min(1).max(20),
  barcodeMode: z.enum(["auto", "manual"]),
  barcode: z.string().trim().max(120).optional(),
  format: z.enum(["code128", "ean13", "upca", "qr", "gs1"]),
  tracking: z.enum(["none", "lot", "lot_expiry", "serial"]),
  allocation: z.enum(["fifo", "fefo", "lifo"]),
  overReceiptTolerance: z.coerce.number().min(0).max(100).default(0),
  minimumShelfLifeDays: z.coerce.number().int().min(0).max(3650).default(0),
}).refine((value) => value.barcodeMode === "auto" || Boolean(value.barcode), { message: "A barcode is required in manual mode", path: ["barcode"] });

export const locationSchema = z.object({
  warehouseId: z.string().uuid(),
  code: z.string().trim().min(1).max(50).transform((value) => value.toUpperCase()),
  type: z.enum(["receiving","storage","picking","packing","shipping","hold","damaged"]),
});

export const receiptSchema = z.object({
  warehouseId: z.string().uuid(),
  locationId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(999999999),
  uom: z.string().trim().min(1).max(20),
  referenceId: z.string().trim().min(1).max(100),
  lotNumber: z.string().trim().max(100).optional(),
  expiryDate: z.string().optional(),
});

export const barcodeSchema = z.object({
  barcodeValue: z.string().trim().min(1).max(120),
  barcodeFormat: z.enum(["code128","ean13","upca","qr","gs1"]),
  uom: z.string().trim().min(1).max(20),
  quantityInBase: z.coerce.number().positive().max(999999999),
});
export const uomConversionSchema=z.object({uom:z.string().trim().min(1).max(20).transform(v=>v.toUpperCase()),unitsPerBase:z.coerce.number().positive().max(999999999)});
export const inventoryStatusSchema=z.object({warehouseId:z.string().uuid(),locationId:z.string().uuid(),itemId:z.string().uuid(),lotNumber:z.string().trim().max(100).optional(),expiryDate:z.string().optional(),status:z.enum(['available','hold','quarantine','damaged']),reason:z.string().trim().min(3).max(500)});

export const transferSchema = z.object({
  itemId: z.string().uuid(),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(999999999),
  uom: z.string().trim().min(1).max(20),
  referenceId: z.string().trim().min(1).max(100),
  lotNumber: z.string().trim().max(100).optional(),
  expiryDate: z.string().optional(),
  note: z.string().trim().max(500).optional(),
}).refine(value=>value.fromLocationId!==value.toLocationId,{message:'Locations must differ',path:['toLocationId']});

export const adjustmentSchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.coerce.number().min(-999999999).max(999999999).refine(value=>value!==0),
  uom: z.string().trim().min(1).max(20),
  reasonCode: z.string().trim().min(1).max(30),
  referenceId: z.string().trim().min(1).max(100),
  lotNumber: z.string().trim().max(100).optional(),
  expiryDate: z.string().optional(),
  note: z.string().trim().max(500).optional(),
});

export const inboundReceiptSchema=z.object({warehouseId:z.string().uuid(),receiptNo:z.string().trim().min(1).max(50),supplier:z.string().trim().min(2).max(150),externalReference:z.string().trim().max(100).optional(),expectedDate:z.string().optional(),itemId:z.string().uuid(),expectedQuantity:z.coerce.number().positive(),uom:z.string().trim().min(1).max(20)});
export const inspectionSchema=z.object({lineId:z.string().uuid(),receivingLocationId:z.string().uuid(),holdLocationId:z.string().uuid().optional(),damagedLocationId:z.string().uuid().optional(),putawayLocationId:z.string().uuid(),acceptedQuantity:z.coerce.number().min(0),heldQuantity:z.coerce.number().min(0),damagedQuantity:z.coerce.number().min(0),lotNumber:z.string().trim().max(100).optional(),expiryDate:z.string().optional(),serialNumbers:z.string().trim().max(20000).optional(),receiptBarcode:z.string().trim().max(120).optional()}).refine(v=>v.acceptedQuantity+v.heldQuantity+v.damagedQuantity>0);

export const salesOrderSchema=z.object({warehouseId:z.string().uuid(),orderNo:z.string().trim().min(1).max(50),customer:z.string().trim().min(2).max(150),requestedShipDate:z.string().optional(),priority:z.enum(['low','normal','high','urgent']),itemId:z.string().uuid(),quantity:z.coerce.number().positive().max(999999999),uom:z.string().trim().min(1).max(20)});
export const pickConfirmationSchema=z.object({locationCode:z.string().trim().min(1).max(50).transform(v=>v.toUpperCase()),barcode:z.string().trim().min(1).max(120)});
export const countPlanSchema=z.object({warehouseId:z.string().uuid(),countNo:z.string().trim().min(1).max(50),countType:z.enum(['cycle','physical','wall_to_wall']),locationId:z.string().uuid().optional(),blindCount:z.string().optional()}).refine(v=>v.countType==='wall_to_wall'||Boolean(v.locationId),{message:'A location is required',path:['locationId']});
export const countEntrySchema=z.object({countedQuantity:z.coerce.number().min(0).max(999999999),locationCode:z.string().trim().min(1).max(50).transform(v=>v.toUpperCase()),barcode:z.string().trim().min(1).max(120)});
