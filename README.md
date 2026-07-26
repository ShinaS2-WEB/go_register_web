# GO REGISTER Web

GO REGISTER Web e um sistema de ponto de venda e gestao comercial criado para pequenos negocios que precisam controlar vendas, caixa, estoque, usuarios e relatorios em uma interface simples e responsiva.

O projeto funciona direto no navegador e usa Firebase/Firestore para sincronizar os dados em tempo real.

## Destaques

- PDV com carrinho, desconto e finalizacao por dinheiro, Pix, cartao de debito ou cartao de credito.
- Controle automatico de estoque a cada venda.
- Abertura e fechamento de caixa com saldo esperado, saldo informado e diferenca.
- Entradas e saidas financeiras manuais.
- Cadastro de produtos, categorias e fornecedores.
- Historico de vendas, caixa e movimentacoes de estoque.
- Relatorios com filtros por periodo, dia especifico e mes.
- Exportacao de relatorios em PDF, inventario em CSV e backup em JSON.
- Gerenciamento de usuarios com perfis de operador, administrador e administrador mestre.
- Tema claro, escuro e variacoes visuais configuraveis.

## Tecnologias

- HTML5
- CSS3
- JavaScript moderno
- Firebase Firestore
- Firebase Authentication
- Material Symbols

## Arquitetura multiempresa

O acesso ocorre em duas etapas: primeiro o usuário seleciona a empresa pelo identificador e depois entra com e-mail e senha. O perfil `users/{uid}` define o `empresa_id`; as regras em `firestore.rules` usam esse vínculo em todas as leituras e gravações. O frontend nunca pode escolher outro `empresa_id`.

O painel separado de empresas fica em `/admin/` e exige uma conta do Firebase Authentication registrada em `platform_admins/{uid}`. Empresas inativas são bloqueadas pelas regras do Firestore.

Para autorizar uma conta administrativa já criada no Firebase Authentication, configure `GOOGLE_APPLICATION_CREDENTIALS` e execute `npm run admin:grant -- admin@exemplo.com`.

## Primeiros Passos

Cadastre a empresa pelo painel administrativo e crie o primeiro usuário por processo administrativo/migração. Depois disso, administradores da empresa criam novos usuários em Ajustes. O antigo cadastro público do primeiro administrador foi removido.

Instale as dependências com `npm install`. Use `npm run test:rules` para validar o isolamento no emulador e `firebase deploy --only firestore,hosting` para publicar regras e hospedagem. Esta arquitetura funciona no plano Spark e não usa Cloud Functions.

## Status

Projeto em desenvolvimento ativo, com foco em paridade entre a experiencia web e o aplicativo GO REGISTER.
# Backend seguro

O GitHub Pages publica apenas `index.html`, `app.js`, `styles.css`, `assets/` e `admin/`. Functions, regras e índices têm deploy separado e manual.

## Desenvolvimento e testes

```bash
npm ci
npm ci --prefix functions
npm test
npx firebase-tools emulators:start --only auth,firestore,functions
npm run emulators:test
```

Deploy manual, após os testes:

```bash
npx firebase-tools deploy --project goregister-7394b --only firestore:rules,firestore:indexes,functions
```

O workflow `firebase-deploy.yml` requer ambiente GitHub protegido `production` e secrets `FIREBASE_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER` e `GCP_SERVICE_ACCOUNT`. Configure projetos separados de homologação e produção; nunca reutilize dados ou credenciais reais nos testes.

Veja [docs/firestore-data-contract.md](docs/firestore-data-contract.md) para o contrato compartilhado com Android e [docs/migration.md](docs/migration.md) antes de migrar dados.

O painel da plataforma usa callable Functions para criar, editar e desativar empresas, administradores e usuários. A exclusão normal de empresa é uma desativação com revogação de contas; `permanentlyDeleteCompany` é uma operação separada que exige empresa previamente inativa e confirmação `DELETE:<companyId>`.

Históricos operacionais usam listeners limitados aos 200 registros mais recentes e carregamento sob demanda. Produtos excluídos recebem tombstone e continuam disponíveis para relatórios e sincronização histórica.
