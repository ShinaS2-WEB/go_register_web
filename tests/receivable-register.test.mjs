import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const paymentFlow = source.slice(source.indexOf('function openReceivablePaymentModal('), source.indexOf('async function cancelReceivable('));
const guard = paymentFlow.slice(paymentFlow.indexOf('const register = await transaction.get('), paymentFlow.indexOf('transaction.set(entryRef,'));

test('recebimento consulta o caixa do servidor e rejeita fechado, ausente ou inválido', async () => {
  assert.ok(guard.includes('registerId'));
  for (const data of [null, {id:1,isOpen:false}, {id:0,isOpen:true}, {id:1.5,isOpen:true}, {id:1,isOpen:'true'}]) {
    await assert.rejects(vm.runInNewContext(`(async () => { ${guard} return registerId; })()`, {
      transaction:{get:async () => ({exists:() => data !== null, data:() => data})},
      tenantDocument:(collection, id) => {assert.equal(collection,'cash_registers'); assert.equal(id,'active_register');},
      collections:{registers:'cash_registers'}, ACTIVE_REGISTER_DOCUMENT:'active_register',
    }), /Caixa fechado/);
  }
  const id = await vm.runInNewContext(`(async () => { ${guard} return registerId; })()`, {
    transaction:{get:async () => ({exists:() => true, data:() => ({id:123,isOpen:true})})},
    tenantDocument:() => {}, collections:{registers:'cash_registers'}, ACTIVE_REGISTER_DOCUMENT:'active_register',
  });
  assert.equal(id,123);
});

test('avisa antes de abrir pagamento mas não bloqueia lançamento de fiado', () => {
  assert.match(paymentFlow, /if \(!currentOpenRegister\(\)\) return toast/);
  assert.match(paymentFlow, /cashRegisterId: registerId/);
  const debtFlow = source.slice(source.indexOf('function openReceivableModal('), source.indexOf('function openReceivablePaymentModal('));
  assert.doesNotMatch(debtFlow, /if \(!currentOpenRegister\(\)\)/);
});
