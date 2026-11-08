import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStockItems, receivableEntryId, receivablePaymentDescription, stockItemsLabel, incomePresentation, isReceivableIncome} from '../assets/js/receivables-stock-core.mjs';

const item = {productId: 1, name: 'Cabo USB', quantity: 1.5, unitPriceCents: 1000};
test('extrato separa cliente e detalhes sem repetir valor nem expor vínculo interno', () => {
  const entry = {category:'RECEIVABLE_PAYMENT:codigo-interno', description:'RAFAEL CUECA PAGOU R$ 97,50 — TIRADA COM LUCAS TESTE1 — BOLSACHEER E ROLSE × 1'};
  assert.equal(isReceivableIncome(entry), true);
  assert.deepEqual(incomePresentation(entry), {title:'RAFAEL CUECA pagou', details:['TIRADA COM LUCAS TESTE1', 'BOLSACHEER E ROLSE × 1']});
  assert.deepEqual(incomePresentation({...entry, description:'JOSE PAGOU R$\u00a010,00'}), {title:'JOSE pagou', details:[]});
  assert.deepEqual(incomePresentation({...entry, description:'Descrição antiga'}), {title:'Pagamento de cliente', details:['Descrição antiga']});
  assert.deepEqual(incomePresentation({description:'Entrada de troco', category:'Outros'}), {title:'Entrada de troco', details:[]});
});
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
