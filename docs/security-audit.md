# Auditoria de segurança — 04/10/2026

## Resultado e escopo

Foram feitas correções no repositório e executados **89 testes de código/HTTP e 24 testes de regras**, todos aprovados. Não houve publicação, migração ou teste de invasão no ambiente de produção. **Há riscos estruturais ainda abertos; este relatório não declara o sistema totalmente seguro.**

A verificação abrangeu autenticação/autorização, isolamento por empresa, regras do Firestore, cancelamentos, aliases de login, persistência no navegador, Cloud Functions, arquivos servidos e configuração de segurança HTTP. O emulador rodou somente em `127.0.0.1`, com dados artificiais. Os testes das funções usam substitutos dos SDKs para validar os caminhos de autorização; não comprovam a implantação das funções nem o funcionamento real do Firebase Authentication.

## Problemas corrigidos no código

| ID | Gravidade | Problema observado | Correção e validação |
|---|---|---|---|
| S01 | Alta | `ADMIN` podia promover a si ou outro usuário a `MASTER_ADMIN` e modificar/apagar administradores via Firestore. A proteção existia só na interface. | Regras verificam o cargo existente e o pretendido. Somente mestre administra cargos administrativos. Testes negativos de promoção, desativação e exclusão; testes positivos de gestão de operadores. |
| S02 | Alta | Um administrador de empresa podia sobrescrever um alias de outra empresa trocando `empresa_id`. Também podia redirecionar um alias administrativo. | Criação/atualização/exclusão verificam empresa anterior, prefixo do alias, cargo do usuário vinculado e correspondência com `authEmail`. Testes de tomada de alias, mudança de e-mail e abuso entre cargos. |
| S03 | Alta | Os documentos completos de empresas ativas eram públicos, incluindo CPF/CNPJ, telefone e endereço gravados pelo painel. | Raiz exige usuário da empresa ou plataforma. Login consulta `company_access/{SHA256(identifier)}`, contendo apenas `companyId`, `name`, `logoUrl`. Listagem pública proibida; campos extras proibidos na projeção. Painel mantém o índice na criação/edição. Migração preparada em `scripts/migrate-company-access.cjs`. **Depende da implantação coordenada abaixo.** |
| S04 | Alta | Operadores podiam cancelar contas e apagar contas/pagamentos sem conhecer a senha, chamando diretamente o banco. Também alteravam/cancelavam vendas e entradas/saídas existentes. | Regras exigem administrador nos cancelamentos/exclusões e nas alterações de vendas, entradas/saídas e movimentos de estoque. Callable de cancelamento também exige cargo administrativo. UI informa a restrição. **Operadores continuam autorizados a criar operações, com as limitações R01 abaixo.** |
| S05 | Alta | Operadores podiam ler o hash de cancelamento e tentar descobrir a senha offline. | Leitura de `settings` passa a exigir administrador, e operadores deixam de assinar a coleção. Testado bloqueio da leitura. |
| S06 | Moderada | SHA-256 simples era usado para novas senhas de cancelamento; verificadores aceitavam também texto puro. | Novas senhas usam PBKDF2-HMAC-SHA256, 600.000 iterações, salt aleatório de 24 bytes e resultado de 32 bytes. Texto puro é rejeitado. Testes de interoperabilidade navegador/backend, senha incorreta e parâmetros adulterados. Hash SHA-256 antigo ainda funciona para transição; redefinir para migrá-lo. |
| S07 | Alta | Operadores podiam mudar preços, criar/apagar produtos, categorias e fornecedores por API, apesar das restrições da interface. | Cadastro e exclusão exigem administrador. Operador só atualiza `stockQuantity` em produtos, como necessário ao PDV, com tipo numérico e intervalo de 0 a 999.999.999. Testes cobrem preço, criação e estoque inválido. A integridade entre estoque e venda ainda depende de R01. |
| S08 | Moderada | Auditoria aceitava o cargo informado pelo cliente, inclusive `PLATFORM_ADMIN`, para UID de operador. | `actorRole` precisa coincidir com a autoridade persistida; UID e imutabilidade já existentes foram preservados. Teste de falsificação de cargo. Os eventos ainda são voluntários no cliente; ver R02. |
| S09 | Moderada | Backend aceitava `isActive` adulterado, desde que não fosse exatamente `false`; IDs eram concatenados em caminhos sem validação. Reset de senha não conferia igualdade do vínculo de empresa. | Status explícito precisa ser booleano `true`. IDs rejeitam barras, controles, vazio, pontos e excesso de comprimento. Reset verifica ambos os vínculos e revoga refresh tokens após mudar a senha. Testes com SDKs substituídos verificam rejeição antes de qualquer escrita. Tokens de acesso já emitidos não são instantaneamente anulados por essa revogação. |
| S10 | Moderada | O servidor local entregava arquivos internos da raiz; Hosting não excluía logs, regras, documentos e diversos arquivos de configuração. | Servidor local usa lista de arquivos públicos e valida caminho real; métodos restritos a GET/HEAD. Hosting exclui logs, JSON, regras, documentação e arquivos de chave. Testes HTTP usam `.git`, `.env`, código do backend, travessias e arquivos públicos reais. Em produção, `public: "."` ainda exige atenção a novos tipos de arquivo; ver R05. |
| S11 | Moderada | Painel administrativo não tinha CSP; proteção contra enquadramento por outro site não existia em cabeçalhos. | CSP também no painel; script inline movido para `admin/load-error.js`. Hosting/servidor local enviam CSP com `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, política de referência e restrição de câmera/microfone/localização. GitHub Pages só recebe a CSP em meta e não oferece os mesmos cabeçalhos desta configuração. |
| S12 | Moderada | O cache local persistia o documento inteiro da empresa. | Cache passa a guardar apenas identificadores, nome e logo. Cache antigo é regravado nesse formato ao ser lido. Não remove cópias em dispositivos que ainda não abriram a versão corrigida. |
| S13 | Baixa | Interface oferecia exceção de senha padrão `admin`, incompatível com o mínimo normal. | Exceção e mensagem removidas; validação local de 6 a 128 caracteres. Isso não redefine senhas de contas existentes. |

Correções de suporte: o pacote do GitHub Pages passou a incluir os módulos de recibo/teclado e os novos arquivos de segurança; a suíte de regras limpa somente o emulador antes da preparação, evitando falsos resultados em execuções repetidas. A verificação de estado da empresa foi simplificada e a transição de cancelamento separada da de pagamento para respeitar o limite de expressões das regras.

## Riscos ainda abertos — não considerar corrigidos

| ID | Gravidade | Evidência e impacto | Trabalho necessário |
|---|---|---|---|
| R01 | Alta | Usuário ativo ainda pode criar diretamente vendas, caixa, entradas/saídas e movimentos com dados calculados por ele; também pode alterar o estoque dentro do intervalo permitido sem uma venda correspondente. O teste de compatibilidade ainda aceita uma venda mínima com `totalAmountInCents: 1`. `checkout` grava venda e estoque separadamente; `cancelTransaction` também não garante devolução idempotente/atômica. | Migrar estas operações para autoridade de servidor que recalcule preços, valide usuário/caixa e aplique estoque/financeiro em transação idempotente, ou redesenhar o contrato com invariantes verificáveis integralmente por regras. Exige adaptar site e APK. Bloquear todas as escritas atuais sem essa implementação impediria o PDV de operar. |
| R02 | Moderada | Logs têm UID/cargo protegidos, mas são enviados separadamente pelo cliente, que pode omiti-los ou inventar ações compatíveis com seu cargo. | Emitir auditoria no servidor na mesma operação financeira. Não usar esses logs como prova incontestável de que a operação aconteceu. |
| R03 | Moderada | Senha de cancelamento continua sendo confirmação adicional na interface para administradores; um administrador autorizado pelas regras pode escrever sem essa confirmação. Hashes SHA-256 antigos continuam legíveis por administradores. | Se a senha deve restringir inclusive administradores, validar exclusivamente em backend, retirar o hash de toda leitura cliente, adicionar controle de tentativas e migrar os cancelamentos. Para atualizar hashes, redefinir a senha no painel. |
| R04 | Moderada | Aliases antigos podem conter e-mails pessoais e são lidos antes do login quando o identificador é conhecido. Identificadores de empresa previsíveis ainda permitem descobrir o nome público, um por tentativa. Não houve revisão de cotas/App Check ou limitação de tentativas em produção. | Migrar aliases legados para identificadores sintéticos e, conforme o modelo de ameaça, mediar a descoberta por endpoint com limitação de tentativas. |
| R05 | Baixa | Hosting continua publicando a raiz com exclusões; arquivos futuros de extensões não bloqueadas podem ser publicados acidentalmente. Algumas coleções legadas não têm schema/limites completos. | Usar diretório gerado por lista explícita de assets e estabelecer schemas/limites compatíveis com todos os clientes. |

`tests/functions.integration.test.js` contém testes legados que referenciam funções inexistentes (`finalizeSale`, `cancelSale`, etc.) e uma dependência ausente. Essa suíte **não foi contabilizada como validada**. As novas verificações em `functions/tests/authorization.test.js` cobrem os exports atuais com SDKs substituídos. Não houve ensaio de navegador autenticado nem teste do APK.

## Implantação coordenada obrigatória

Não publicar só o HTML/JavaScript: a nova descoberta de empresa depende do índice e das novas regras. O APK antigo que consulta a coleção pública `companies` precisará adotar o novo contrato antes do fechamento dessa leitura. Validar essa mudança em homologação e coordenar a publicação dos clientes.

1. Fazer backup administrativo e revisar o projeto de destino. O script abaixo só cria/substitui projeções públicas, não apaga os documentos de empresa. Ele interrompe antes de gravar se houver identificador vazio ou duplicado.
2. Simular, com credencial administrativa já configurada:

   ```powershell
   node scripts/migrate-company-access.cjs --project=goregister-7394b
   ```

3. Após revisar o resultado, aplicar:

   ```powershell
   node scripts/migrate-company-access.cjs --project=goregister-7394b --apply
   ```

4. Publicar de forma coordenada regras, funções e Hosting, após compatibilizar o APK. O repositório possui publicação automática do site em pushes para `main`; não fazer um push isolado antes de preparar a migração/regras.
5. Redefinir a senha de cancelamento pelo painel para converter hashes legados. Senhas guardadas em texto puro deixam de funcionar. Avisar operadores de que cancelamentos agora exigem conta administrativa.
6. Validar login novo e existente, gestão de operadores, venda, caixa, recibo, pagamento parcial e cancelamento administrativo em homologação antes da liberação ampla.

Não executei estas etapas em produção. A edição/configuração real do banco e as regras efetivamente publicadas não foram consultadas: a tentativa de obter a CLI atual falhou no modo de rede/cache restrito.

## Testes e limites

Comandos executados localmente (Node 24; isolamento de processos desativado porque o sandbox bloqueou a criação dos subprocessos do `npm test` com `EPERM`):

```powershell
node --test --test-isolation=none functions/tests/*.test.js tests/*.test.mjs admin/tests/*.test.cjs
node --test --test-isolation=none tests/firestore.rules.test.js
```

O segundo comando exige o Firestore Emulator em `127.0.0.1:8080`. Foi usado o JAR 1.19.8 com Java 21 e locale `en_US` (o bundle de mensagens `pt_BR` desse JAR falhava ao avaliar negativas). Testes: **89/89** e **24/24**; verificação de sintaxe e `git diff --check` também executadas.

O `npm audit` local estava em modo offline. Seu retorno vazio não foi tratado como ausência comprovada de CVEs. A revisão automática bloqueou o envio de metadados ao npm; o usuário escolheu manter somente a análise local. Não foram realizadas novas consultas online de dependências.

Referências consultadas para os controles: [condições e operações atômicas das regras](https://firebase.google.com/docs/firestore/security/rules-conditions) e [cabeçalhos/configuração do Firebase Hosting](https://firebase.google.com/docs/hosting/full-config). Estas referências descrevem os mecanismos, não certificam este aplicativo.

Aviso da skill de Firestore aplicada: “I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for tenant isolation, role restrictions and protected public company discovery. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.” As limitações concretas desta implementação são as listadas em R01–R05.
