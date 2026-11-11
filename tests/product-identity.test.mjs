import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uniqueStockProducts, requireAddedStockSelection} from '../assets/js/receivables-stock-core.mjs';

test('cópia antiga não duplica produto nem substitui estoque atualizado do documento principal', () => {
  const canonical = {id:123,docId:'123',name:'Cabo',stockQuantity:8};
  const legacy = {id:123,docId:'legacy-copy',name:'Cabo',stockQuantity:10};
  for (const rows of [[canonical,legacy], [legacy,canonical]]) {
    assert.deepEqual(uniqueStockProducts(rows), [canonical]);
    assert.equal(uniqueStockProducts(rows.map(p => p.docId === '123' ? {...p,stockQuantity:7} : p))[0].stockQuantity,7);
  }
});

test('não mistura produtos de mesmo nome com identificadores diferentes', () => {
  const products = [{id:1,docId:'1',name:'Cabo'}, {id:2,docId:'2',name:'Cabo'}];
  assert.deepEqual(uniqueStockProducts(products), products);
  assert.equal(uniqueStockProducts([{id:1,docId:'1'}, {id:'1',docId:'copy'}, {id:0}]).length,1);
  assert.equal(uniqueStockProducts([{id:0,docId:'99'}])[0].id,99);
});

test('selecionar sem adicionar não salva conta manual silenciosamente', () => {
  assert.throws(() => requireAddedStockSelection('123'), /Adicionar/);
  assert.doesNotThrow(() => requireAddedStockSelection(''));
  assert.doesNotThrow(() => requireAddedStockSelection(null));
  const source = readFileSync(new URL('../assets/js/app.js', import.meta.url),'utf8');
  const modal = source.slice(source.indexOf('function openReceivableModal('), source.indexOf('function openReceivablePaymentModal('));
  assert.match(modal, /requireAddedStockSelection\(form.get\("stockProduct"\)\)/);
  assert.match(modal, /\[name="stockProduct"\].*value = ""/);
  assert.match(source, /state.data.products = uniqueStockProducts\(state.data.products\)/);
  assert.match(source, /state.productSourceDocuments = state.data.products/);
  assert.match(source, /products: backupDocuments\(state.productSourceDocuments\)/);
  assert.match(source, /state.productSourceDocuments = \[\]/);
});
