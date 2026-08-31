import assert from "node:assert/strict";
import test from "node:test";
import { retailCheckDigit } from "../lib/barcodes.ts";

test("calculates EAN-13 check digits", () => {
  assert.equal(retailCheckDigit("400638133393"), "1");
});

test("calculates UPC-A check digits", () => {
  assert.equal(retailCheckDigit("03600029145"), "2");
});
