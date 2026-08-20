import assert from'node:assert/strict';import test from'node:test';import{parseGs1}from'../lib/gs1.ts';
test('parses human-readable GS1 item lot expiry and serial',()=>{assert.deepEqual(parseGs1('(01)09506000134352(10)LOT-42(17)271231(21)SN-9'),{item:'09506000134352',lot:'LOT-42',expiry:'2027-12-31',serial:'SN-9'})});
test('parses scanner GS1 element strings',()=>{assert.deepEqual(parseGs1(']C1010950600013435217271231\x1d10LOT-42\x1d21SN-9'),{item:'09506000134352',expiry:'2027-12-31',lot:'LOT-42',serial:'SN-9'})});
