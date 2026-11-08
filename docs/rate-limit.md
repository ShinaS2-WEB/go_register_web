# Limitação de requisições e exposição no navegador

Implementação local de 04/10/2026. **Nenhuma configuração foi publicada em produção.** Não representa proteção completa contra DDoS volumétrico.

## O que foi aplicado

As quatro funções callable usam o mesmo controle de autorização e limite em `functions/src/protection.js`. Há duas camadas:

1. Antes de consultas de autorização: rejeição de anônimos, limite em memória de 30 tentativas/minuto por UID e 300/minuto por instância, compartilhados entre os endpoints que executarem naquela instância. A identidade é o UID validado pelo SDK do Firebase; campos enviados pelo cliente e cabeçalhos de IP não escolhem o contador. Memória limitada a 10.000 identidades, sem expulsar contadores ativos para abrir espaço. Esses limites locais são auxiliares e reiniciam com a instância.
2. Depois de validar o cargo/vínculo: janela deslizante persistente em transação no Firestore. A cota é compartilhada entre instâncias/reinícios e por UID + operação, independentemente da empresa/alvo informado. Não aceita rajada dupla na virada de minuto.

| Operação callable | Limite por usuário autorizado |
|---|---|
| Alterar senha de usuário | 5 em 60 segundos |
| Redefinir senha de cancelamento | 5 em 15 minutos |
| Cancelar conta a receber | 10 em 60 segundos |
| Limpar dados da empresa | 1 em 15 minutos |

Tentativas com argumentos inválidos, senha de cancelamento incorreta ou erro posterior à reserva também consomem a cota persistente. O cliente deve respeitar `resource-exhausted` e `error.details.retryAfterSeconds`, sem repetição imediata. O protocolo callable converte `resource-exhausted` em HTTP 429; não foi adicionado cabeçalho HTTP customizado às callables. Nos testes locais das funções foi validado o erro estruturado; não foi realizado teste HTTP do serviço callable implantado.

Contadores ficam em `_rate_limits/{SHA256([operação,UID])}`, sem guardar senha, IP ou UID em texto puro. As regras existentes negam leitura/escrita por todos os clientes, inclusive administradores de plataforma no navegador. Somente o Admin SDK do backend escreve. Cada usuário autorizado ocupa no máximo quatro documentos. Há `expiresAt` para eventual TTL, mas **TTL não foi habilitado**; validade da cota não depende da limpeza. Cada reserva adiciona custos de leitura/escrita/transação. Falha ou corrupção do contador retorna `unavailable` e impede a operação.

Capacidade configurada no código: `minInstances: 0`, `maxInstances: 3`, `concurrency: 10`, timeout de 60 s para cada função normal; limpeza limitada a uma instância, concorrência 1 e timeout de 540 s. Esse controle reduz expansão de capacidade, mas pode rejeitar usuários legítimos sob carga; não é teto garantido de gastos nem proteção de rede. Consultar [gerenciamento de instâncias do Firebase](https://firebase.google.com/docs/functions/manage-functions).

## Servidor local

`npm start` continua escutando somente em `127.0.0.1`. Foram adicionados:

- 120 requisições por IP em janela deslizante de 60 segundos, com tabela limitada a 1.000 IPs.
- Resposta HTTP 429 com `Retry-After`, `Cache-Control: no-store` e fechamento da conexão.
- IP obtido do socket; `X-Forwarded-For` e `X-Real-IP` não permitem trocar a cota.
- Limites de conexões, cabeçalhos, requisições por conexão e timeouts.

Este servidor **não é executado pelo Firebase Hosting nem pelo GitHub Pages**. Portanto seu limite de IP não protege as páginas em produção. Se for adotado um proxy confiável no futuro, a identificação do IP precisa ser projetada explicitamente, sem confiar livremente em cabeçalhos do cliente.

## Cobertura que ainda falta em produção

O site e o painel fazem muitas operações diretamente via Firebase Auth/Firestore, incluindo descoberta de empresas, login, consultas e gravações. Esses acessos **não passam pelas quatro callables**; não herdam suas cotas, mesmo após publicar as funções. Não foi criado um limite cosmético em JavaScript, que seria facilmente ignorado pelo atacante.

Para cobrir essa superfície é necessário registrar os clientes web/Android no App Check, integrar os provedores apropriados, observar métricas e então habilitar enforcement nos serviços suportados. Não há chave/provedor App Check configurado neste projeto; ativar enforcement isoladamente interromperia os clientes atuais. A exigência nas callables também precisa ser configurada após integrar os clientes. [App Check](https://firebase.google.com/docs/app-check), [enforcement nas callables](https://firebase.google.com/docs/app-check/cloud-functions).

Revisar ainda cotas do Authentication, monitoramento e alertas de consumo. Um WAF/CDN no domínio do site não protege automaticamente os endpoints diretos do Google; essa proteção precisa cobrir a origem real do tráfego. Não houve alteração de DNS, instalação de serviço pago ou aplicação de cotas de produção. Consulte a [lista de segurança do Firebase](https://firebase.google.com/support/guides/security-checklist).

## Dados no DevTools

Tudo que o navegador recebe ou envia pode ser inspecionado pelo usuário daquele navegador. O código atual permite observar:

- Tokens da própria sessão e a requisição de autenticação, incluindo a senha que o próprio usuário digitou. HTTPS protege o transporte, não esconde os dados do navegador de origem.
- Dados comerciais e cadastrais que as regras permitem ler naquela conta. Operadores autenticados ainda leem o documento raiz de sua empresa; se ali constam CPF/CNPJ/telefone/endereço, eles podem vê-los. O perfil complementar em `company_profile` é restrito aos administradores.
- Hash de cancelamento para administradores. Operadores foram bloqueados nas correções anteriores. Esse hash não deveria chegar a cliente algum caso a senha precise restringir inclusive administradores; essa migração para backend permanece pendente.
- E-mails pessoais eventualmente presentes em aliases legados de login, que continuam sendo consultáveis antes da autenticação quando o identificador é conhecido.

`apiKey`, `projectId` e `authDomain` do Firebase no JavaScript são identificadores públicos, não uma chave de conta de serviço. A chave deve estar restrita às APIs apropriadas; não confirmei as restrições do projeto em produção. [Explicação oficial sobre chaves Firebase](https://firebase.google.com/docs/projects/api-keys).

Não foi inspecionada uma sessão autenticada de produção. As observações acima decorrem do código e das regras locais. Bloquear F12 ou ofuscar JavaScript não impede o acesso a dados entregues ao navegador.

## Validação e publicação

Foram aprovados **96 testes de código/HTTP e 26 testes no Firestore Emulator**, incluindo concorrência real nas transações, isolamento de contadores, falha do banco, tentativas negadas, janela deslizante, limite de memória, HTTP 429 e falsificação de cabeçalhos. Testes de rajada usaram somente loopback e dados artificiais.

```powershell
node --test --test-isolation=none functions/tests/*.test.js tests/*.test.mjs admin/tests/*.test.cjs
node --test --test-isolation=none tests/firestore.rules.test.js
```

O segundo comando exige emulador local em `127.0.0.1:8080`. Foi usado Node 24 com isolamento desativado devido à restrição de subprocessos do sandbox. Nenhuma dependência foi adicionada nem houve consulta online ao npm.

Revisar junto à [migração de segurança anterior](security-audit.md), instalar as dependências já declaradas do diretório `functions/` no ambiente de implantação, testar em homologação e publicar as funções para ativar as cotas. O índice de login, regras e clientes continuam exigindo a implantação coordenada descrita naquele relatório.
