import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const constants = source.slice(source.indexOf('const collections ='), source.indexOf('const themeOptions ='));
const cancelFunction = source.slice(source.indexOf('async function cancelReceivable('), source.indexOf('function openReceivablePaymentHistory('));

for (const scenario of [
  {name:'cancelar conta paga sem devolver estoque', status:'PAID', remove:false, returned:false},
  {name:'cancelar conta paga com devolução', status:'PAID', remove:false, returned:true},
  {name:'cancelar e apagar conta paga', status:'PAID', remove:true, returned:true},
  {name:'apagar conta anteriormente cancelada', status:'CANCELLED', remove:true, returned:false},
]) {
  test(scenario.name + ' usa caminhos válidos e anula o recebimento', async () => {
    const updates = [], deletions = [], creations = [], collectionsRead = [];
    const account = {id:'account-1', status:scenario.status, lastPaymentId:'payment-1', originalAmountCents:9750,
      stockItems:[{productId:1, name:'Produto', quantity:1, unitPriceCents:9750}]};
    const document = (path, data) => ({ref:path, exists:() => true, data:() => data});
    const payment = document('receivable_payments/payment-1', {financialEntryId:-10});
    const records = {
      'receivables/account-1':account,
      'products/1':{stockQuantity:9},
      'financial_entries/-10':{receivableId:'account-1', isCancelled:false},
    };
    let choices = 0;
    const context = vm.createContext({
      findReceivable:() => account, receivableDisplayStatus:r => r.status, docKey:r => r.id,
      openConfirmModal:async () => true,
      openChoiceModal:async () => choices++ === 0 ? scenario.remove : scenario.returned,
      requestCancellationPassword:async () => 'test-only',
      tenantDocument:(collection, id) => {assert.equal(typeof collection, 'string'); return `${collection}/${id}`;},
      tenantCollection:collection => {assert.equal(collection, 'receivable_payments'); collectionsRead.push(collection); return collection;},
      getDoc:async path => document(path, records[path]),
      getDocs:async () => ({size:1, docs:[payment]}), query:collection => collection, where:() => null,
      runAction:async action => action(), db:{},
      runTransaction:async (_, action) => action({
        get:async path => {assert.ok(records[path]); return document(path, records[path]);},
        update:(path, data) => updates.push({path, data}), set:(path, data) => creations.push({path, data}),
      }),
      writeBatch:() => ({delete:path => deletions.push(path), commit:async () => {}}),
      receivableEntryId:() => -20, randomUuid:() => 'test-id', validateStockItems:() => {},
      tenantPayload:data => data, receivableActorUid:() => 'operator', writeAuditLog:async () => {}, toast:() => {},
    });
    vm.runInContext(constants + cancelFunction, context);
    await context.cancelReceivable('account-1');
    assert.ok(collectionsRead.length > 0);
    if (scenario.status !== 'CANCELLED') {
      assert.ok(updates.some(u => u.path === 'receivables/account-1' && u.data.status === 'CANCELLED'));
      assert.ok(updates.some(u => u.path === 'financial_entries/-10' && u.data.isCancelled === true));
      assert.equal(updates.some(u => u.path === 'products/1' && u.data.stockQuantity === 10), scenario.returned);
      assert.equal(creations.length, scenario.returned ? 1 : 0);
    } else assert.equal(updates.length, 0);
    assert.deepEqual(deletions, scenario.remove ? ['receivable_payments/payment-1', 'receivables/account-1'] : []);
  });
}
