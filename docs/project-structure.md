# Estrutura do projeto

## Organização

```text
index.html                    Entrada do site principal
assets/
  js/                         Aplicação e módulos do frontend
  css/                        Estilos do site e dos recibos
  vendor/                     Biblioteca de QR Code e sua licença
  goregisterlogo.png           Logotipo compartilhado
admin/                        Painel mestre e seus recursos específicos
  tests/                      Testes do painel
docs/                         Guias, contratos de dados e auditorias
functions/                    Backend existente, preservado
scripts/                      Servidor local e ferramentas administrativas
tests/                        Testes do frontend, HTTP e integração
.github/workflows/            Validação e publicação
```

Os arquivos de configuração do Firebase, regras, índices e pacotes permanecem
na raiz, onde as ferramentas existentes os esperam.

## O que é útil e foi mantido

- `assets/js/app.js`: concentra telas, eventos e integração com Firebase. É
  grande, mas dividir suas responsabilidades exigiria refatorar a lógica;
  nesta organização seu conteúdo foi preservado integralmente.
- Módulos `*-core.mjs` e `keyboard.mjs`: possuem referências no aplicativo,
  no painel ou nos testes. Não foram identificados módulos sem uso nesse grupo.
- `assets/vendor/qrcode.mjs` e sua licença: necessários para gerar QR Codes
  dos recibos; não são cópias descartáveis.
- Estilos compartilhados e estilos específicos do painel: permanecem separados
  para preservar a ordem de carregamento e a apresentação atual.
- Testes, scripts administrativos e documentação de segurança: têm função
  de validação, operação ou histórico; não devem ser excluídos por não serem
  importados pelo navegador. Relatórios antigos mantêm os caminhos da época
  em que foram produzidos.

## Arquivos gerados ou dispensáveis no versionamento

`node_modules/`, `functions/node_modules/`, `.firebase/`, `.tmp/`, `_site/` e logs
do Firebase são dependências, caches ou saídas geradas. Não fazem parte do
código-fonte e devem continuar ignorados pelo Git. Não foram apagados arquivos
locais nem removidas dependências sem evidência de que sejam desnecessárias.

Não foi feita remoção de funções, seletores CSS ou dependências por aparente
falta de uso: eventos e HTML são montados dinamicamente, então uma busca textual
isolada não comprova que esses elementos sejam descartáveis.

## Limites desta reorganização

Foram movidos os JavaScripts e CSS da raiz para `assets/`, e os dois guias de
APK e Contas a Receber para `docs/`. Foram atualizados somente os caminhos
necessários no HTML, imports, servidor local, testes e cópia do GitHub Pages.
As rotas de entrada `/` e `/admin/` foram mantidas.

Banco de dados, regras, índices, configuração Firebase, backend e scripts de
migração não foram modificados nem executados contra serviços externos.
As alterações que já existiam no projeto antes da organização foram preservadas.
Nenhuma publicação foi realizada.

Para validar o código local, use `npm test`. Os testes que precisam do emulador
Firestore ficam fora dessa verificação; esta reorganização não requer migração.
