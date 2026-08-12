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

O acesso ocorre em duas etapas: primeiro o usuário seleciona a empresa pelo identificador de acesso e depois entra com nome de usuário e senha. O identificador de acesso (`identifier`) é independente do CPF/CNPJ (`taxIdentifier`). O perfil `users/{uid}` define o `empresa_id`; as regras em `firestore.rules` usam esse vínculo em todas as leituras e gravações. O frontend nunca pode escolher outro `empresa_id`.

O painel separado de empresas fica em `/admin/` e exige uma conta do Firebase Authentication registrada em `platform_admins/{uid}`. Empresas inativas são bloqueadas pelas regras do Firestore.

Os dados empresariais complementares são gravados no perfil privado
`companies/{companyId}/company_profile/official`. Somente o painel administrativo
da plataforma pode editá-los. Administradores da empresa podem consultá-los no
site principal apenas para gerar relatórios; operadores não recebem esse perfil
e ele não é salvo no cache do navegador.

URL do logotipo, mensagem do recibo, política de troca e redes sociais ficam separadas em
`companies/{companyId}/receipt_settings/official`. Todos os usuários ativos da
empresa podem ler somente essas configurações para emitir comprovantes, mas a
edição continua exclusiva do painel administrativo da plataforma. Por ser um
recurso público, a URL do logotipo também é espelhada no documento da empresa.

### Publicação obrigatória das regras

Antes de publicar uma versão do site que use o perfil empresarial privado,
publique também o arquivo `firestore.rules`:

```powershell
firebase deploy --only firestore:rules
```

O GitHub Pages publica apenas HTML, CSS, JavaScript e imagens. Ele não publica as
regras do Firestore automaticamente. Sem essa etapa, o cadastro complementar e
os relatórios com os novos dados serão bloqueados pelo Firebase.

## Primeiros Passos

Cadastre a empresa pelo painel administrativo e crie o primeiro usuário por processo administrativo/migração. Depois disso, administradores da empresa criam novos usuários em Ajustes. O antigo cadastro público do primeiro administrador foi removido.

O site não exige instalação de dependências para funcionar no navegador. Para
publicar com Firebase CLI, autentique-se no projeto correto e use
`firebase deploy --only firestore:rules,hosting`. O diretório `functions/` possui
dependências próprias e só precisa de `npm install` dentro dele quando as Cloud
Functions forem alteradas ou publicadas.

## Status

Projeto em desenvolvimento ativo, com foco em paridade entre a experiencia web e o aplicativo GO REGISTER.
