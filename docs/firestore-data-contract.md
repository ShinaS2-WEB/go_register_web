# Contrato de dados do Firestore

Vigência para novos registros: após a publicação conjunta das Functions e regras desta alteração. Registros legados não são alterados automaticamente.

## Identificadores e dinheiro

- `documentId`: ID automático do Firestore; é a identidade persistente.
- `saleNumber`: contador transacional, usado apenas no comprovante.
- `productId`: `documentId` estável do produto (IDs numéricos antigos continuam legíveis).
- `userUid`: UID real do Firebase Authentication.
- Valores novos são inteiros em centavos: `unitPriceInCents`, `subtotalInCents`, `discountInCents`, `totalAmountInCents`, `initialBalanceInCents`, `closingBalanceInCents` e `amountInCents`.
- Leitores devem preferir campos em centavos e, temporariamente, converter campos legados (`sellingPrice`, `finalAmount`, `amount`) multiplicando por 100 e arredondando.

## Pagamento

Valores gravados: `CASH`, `PIX`, `DEBIT_CARD`, `CREDIT_CARD`.

Na leitura legada, normalizar `CREDIT_CREDIT`, `CARD_CREDIT` e `CREDIT` para `CREDIT_CARD`; `DEBIT` para `DEBIT_CARD`.

## Venda

`sales/{documentId}` contém `saleNumber`, `items[]`, totais em centavos, `paymentMethod`, `cashRegisterId`, `userUid`, `createdAt`, `idempotencyKey` e campos de cancelamento. Itens guardam snapshots de nome e preço. A escrita é exclusiva de `finalizeSale` e `cancelSale`.

## Exclusão lógica

Produtos sincronizados não devem ser removidos. O tombstone é:

```json
{
  "isDeleted": true,
  "isActive": false,
  "deletedAt": "server timestamp",
  "deletedByUid": "Firebase Auth UID"
}
```

O Android deve baixar tombstones, ocultá-los de novas vendas e preservar itens históricos.

## Functions usadas pelos clientes

- `finalizeSale`, `cancelSale`
- `openCashRegister`, `closeCashRegister`
- `createFinancialMovement`, `adjustStock`
- `setCancellationPassword` / `changeCancellationPassword`
- `createCompanyUser`, `updateCompanyUser`, `disableCompanyUser`, `resetCompanyUserPassword`
- `softDeleteProduct`, `deactivateCompany` e a operação excepcional `permanentlyDeleteCompany`

Todas exigem autenticação e derivam empresa, papel e operador dos documentos protegidos. Nunca enviar total, preço, estoque ou papel como fonte de verdade.

## Campos de auditoria

`createdAt`, `openedAt`, `closedAt`, `cancelledAt`, `actorUid`, `userUid`, `openedByUid`, `closedByUid`, `cancelledByUid` são timestamps/UIDs de servidor. Logs ficam em `audit_logs` e são imutáveis para clientes.

## Ajustes necessários no Android

Usar callable Functions nas operações acima; aceitar IDs string; enviar/ler centavos; normalizar o enum; processar tombstones; usar `userUid`; e não escrever vendas, estoque, movimentos, caixas ou usuários diretamente.
