import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStockItems, receivableEntryId, receivablePaymentDescription, stockItemsLabel} from '../receivables-stock-core.mjs';

const item = {productId: 1, name: 'Cabo USB', quantity: 1.5, unitPriceCents: 1000};
test('quantidades fracionadas geram valor em centavos e rejeitam entradas inválidas', () => {
  assert.equal(validateStockItems([item]), 1500);
  assert.equal(validateStockItems([]), 0);
  for (const quantity of [-1, 0, NaN, Infinity, 1000001]) assert.throws(() => validateStockItems([{...item, quantity}]));
  assert.throws(() => validateStockItems([item,item]));
  assert.throws(() => validateStockItems([{...item,unitPriceCents: -1}]));
  assert.throws(() => validateStockItems(Array.from({length:11}, (_,index) => ({...item,productId:index+1}))));
});
test('id financeiro é determinístico e compatível com Android', () => {
  assert.equal(receivableEntryId('12345678-1234-1234-1234-123456789abc'), -320255972942657);
  assert.throws(() => receivableEntryId('../outro'));
});
test('descrição preserva cliente, pagamento parcial, observação e produto', () => {
  const account = {customerName:'Jose Lorival',description:'Compra fiada',stockItems:[item]};
  const text = receivablePaymentDescription(account,1000);
  assert.match(text, /JOSE LORIVAL PAGOU/); assert.match(text, /10,00/);
  assert.match(text,/Compra fiada/); assert.match(text,/Cabo USB/);
  assert.match(stockItemsLabel({...account,description:''}),/Cabo USB/);
});
