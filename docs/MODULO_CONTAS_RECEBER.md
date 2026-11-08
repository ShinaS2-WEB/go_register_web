# Módulo opcional — Clientes e Contas a Receber

Este módulo foi criado como um adicional pago que pode ser liberado separadamente para cada empresa pelo painel administrativo.

## O que ele faz

- Cadastra clientes usados apenas no controle de contas a receber.
- Registra contas manuais com descrição, valor e vencimento.
- Mostra saldo em aberto, contas parciais, pagas e atrasadas.
- Aceita recebimentos parciais ou totais e mantém o histórico de cada conta.
- Gera uma mensagem de cobrança para envio pelo WhatsApp.
- Mantém os dados separados por empresa.

O módulo não cria uma venda e não movimenta o caixa automaticamente. Ao receber um valor, ele reduz somente a dívida do cliente. Quando o dinheiro também precisar aparecer no caixa, o operador deve registrar uma entrada manual separada.

## Controle do adicional no painel administrativo

O painel permite configurar, para cada empresa:

- módulo contratado: ativado ou desativado;
- situação: período de teste, ativo, pagamento atrasado ou suspenso;
- validade do acesso;
- valor contratado;
- ciclo mensal, anual ou pagamento único;
- próximo vencimento;
- observações administrativas privadas.

Empresas que nunca contrataram o adicional não recebem o documento de licença e não veem o menu do módulo.

## Níveis de acesso

- **Ativo ou teste válido:** pode consultar, cadastrar clientes e contas e registrar recebimentos.
- **Desativado, suspenso, em atraso ou vencido:** pode consultar o histórico e receber contas já existentes, mas não pode criar novas contas ou clientes.
- **Nunca contratado:** o módulo fica totalmente oculto.

Os dados comerciais do contrato, como preço e observações administrativas, são privados do administrador da plataforma.

## Compatibilidade com o Firebase Spark

Esta versão não usa Cloud Functions e não exige o plano Blaze. Ela utiliza operações e transações do próprio Firestore, compatíveis com o plano Spark.

As regras atualizadas do Firestore são obrigatórias para proteger o módulo. O site e o APK só devem ser liberados depois que essas regras forem publicadas e testadas em uma empresa de teste.

## Ordem segura de publicação

1. Fazer um backup do Firestore.
2. Publicar `firestore.rules`.
3. Abrir o painel administrativo e ativar o adicional somente para a empresa de teste.
4. Publicar os arquivos do site.
5. Testar cadastro de cliente, conta, recebimento parcial, recebimento total, suspensão e vencimento.
6. Instalar o novo APK sobre a versão anterior em um aparelho de teste.
7. Somente depois liberar o adicional para uma empresa pagante.

## Limites conhecidos desta versão

- O módulo ainda não transforma automaticamente uma venda do PDV em dívida.
- O recebimento não lança automaticamente uma entrada no caixa.
- A exclusão de uma empresa remove os perfis do Firestore, mas a conta correspondente no Firebase Authentication deve ser conferida e, se necessário, removida manualmente no Console do Firebase.
- Antes da produção, as regras devem ser testadas contra o Firebase real ou o Emulator Suite.
