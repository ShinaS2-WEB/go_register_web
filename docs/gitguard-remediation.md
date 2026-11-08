# Tratamento do relatório GitGuard — 11/10/2026

Referência: `gitguard-report-th23dev-go_register_web-1wkid23d.md`, scan
`cmv2sgsoy0frrk0a21wkid23d`, commit `69eae234fc16`.

As alterações desta revisão são locais. O checkout já continha mudanças de uma
auditoria anterior, que foram preservadas. Não houve deploy, push, migração de
dados, revogação ou alteração de credenciais em produção. Este documento não
substitui uma nova execução do GitGuard nem certifica a segurança do projeto.

## Destino dos 24 alertas

| Quantidade | Alerta | Tratamento |
|---|---|---|
| 2 | CVEs de `qs` | Atualização dos lockfiles para a versão corrigida, conforme detalhamento abaixo. |
| 1 | CVE de `uuid` | Versão corrigida que preserva CommonJS; overrides limitados aos dependentes legados. |
| 12 | GitHub Actions com tags mutáveis | Os três workflows usam hashes completos de commits verificados nos repositórios oficiais, com a versão em comentário. |
| 4 | Senha fixa, divulgação de erro, aleatoriedade e regex dinâmica em `assets/firebase/firebase-auth.js:1` | Removidas as três cópias locais não utilizadas do SDK. Ambos os clientes já importavam o SDK pelo CDN oficial. Não foram criadas exclusões gerais de scanners. |
| 1 | Sanitização por `replaceAll` em `admin/admin.js` | Escape de HTML em uma passagem para `&`, `<`, `>`, aspas duplas e simples. Também protegidos 11 atributos `data-*` com IDs/UIDs antes interpolados sem escape. |
| 1 | Regex DoS em `optionalDateMillis` | Falso positivo: expressão ancorada com quantificadores fixos. A validação foi endurecida para rejeitar entradas acima de 10 caracteres, sem aceitar prefixos truncados. Mesma proteção aplicada à data de abertura. |
| 1 | Timing attack na confirmação de senha | Falso positivo: compara duas entradas locais do mesmo formulário, não uma senha contra um segredo armazenado. Autenticação continua sendo feita pelo Firebase Auth. |
| 2 | Chave Google em `app.js` e `admin/admin.js` | É a mesma chave pública Firebase; não é uma credencial de conta de serviço. Consulta real das restrições realizada. Separação e restrição da chave Web permanecem pendentes da definição dos domínios e da compatibilidade com o aplicativo Android. |

## SDK local e falsos positivos

Foram removidos `assets/firebase/firebase-app.js`, `firebase-auth.js` e
`firebase-firestore.js`. Não havia imports nem referências de carregamento para
esses arquivos no site/painel. Seus imports existentes continuam apontando para
`https://www.gstatic.com/firebasejs/10.12.4/`.

A ocorrência de `PASSWORD: "password"` no bundle de Auth é um identificador de
provedor, não uma senha da aplicação. O bundle também contém utilitários de
eventos/callbacks, mensagens de erro e expressões dinâmicas da biblioteca.
Remover código morto elimina a cópia apontada pelo scan, mas não representa uma
auditoria completa nem uma correção manual do SDK carregado do CDN.

Não foi adicionada uma allowlist global para `assets`, `admin`, segredos ou
regras do Semgrep. Os falsos positivos locais foram documentados no código;
um scanner pode voltar a sinalizá-los até a triagem ser registrada nele.

## Chave Firebase: constatação e pendência

Consulta somente de leitura à API oficial de gerenciamento de chaves, usando
a sessão Firebase CLI já autenticada, confirmou:

- Projeto `goregister-7394b`, número `1071850298174`.
- Chave cadastrada como `Android key (auto created by Firebase)`.
- `androidKeyRestrictions` vazio, sem aplicativos especificados nesse campo.
- Lista de 27 APIs permitidas, incluindo Firebase Auth, Secure Token e Firestore,
  mas também APIs que o site não utiliza, como `sqladmin.googleapis.com` e
  `firebasevertexai.googleapis.com`.
- `generativelanguage.googleapis.com` não consta da lista retornada.

O valor da chave e os tokens usados nessa consulta não são reproduzidos aqui.
Esses dados não provam abuso nem acesso sem autorização ao banco. Segundo a
[documentação do Firebase](https://firebase.google.com/docs/projects/api-keys),
chaves Firebase podem ser públicas; autorização depende de Auth, regras/IAM e
App Check, e as restrições devem limitar os serviços utilizados.

Para concluir o endurecimento sem interromper clientes:

1. Confirmar todos os domínios de produção/homologação e se o APK usa essa mesma
   chave. A pergunta sobre os domínios foi enviada durante esta revisão.
2. Criar uma chave Web separada, com APIs necessárias ao cliente e referrers
   dos domínios confirmados. Usar chave separada para desenvolvimento local.
3. Antes de testar restrições por referrer, alterar de modo coordenado
   `Referrer-Policy: no-referrer` em `firebase.json` e as metas de `index.html`
   e `admin/index.html` para uma política compatível, como
   `strict-origin-when-cross-origin`. O servidor local deriva o cabeçalho de
   `firebase.json`. Sem isso, o navegador pode omitir o referrer exigido pela chave.
4. Substituir a configuração nos dois clientes, testar login e renovação de
   sessão em homologação e publicar de modo coordenado.
5. Revisar separadamente a chave Android antiga, as APIs realmente necessárias
   ao APK e suas restrições de pacote/certificado. Uma nova chave Web não remove
   a exposição da chave antiga, inclusive no histórico Git; revogá-la antes de
   migrar os consumidores interromperia esses clientes.

Não foi movida a chave para `.env` como se isso a tornasse secreta: qualquer
chave incluída no JavaScript do navegador continua pública. As
[restrições oficiais de API keys](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys)
devem ser aplicadas no Google Cloud.

## Dependências e validação

`qs` foi atualizado para `6.16.0` nos dois lockfiles. Dependentes CommonJS de
`uuid` usam `11.1.1` com overrides restritos a seus pacotes, preservando o
carregamento por `require`. Outros dependentes que já usam versões corrigidas
mais novas não foram rebaixados.

Foram conferidos os avisos dos mantenedores:

- [CVE-2026-82562: limite de arrays de qs](https://github.com/ljharb/qs/security/advisories/GHSA-x5fp-wj9c-mxmx).
- [CVE-2026-82417: isBuffer de qs](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g).
- [CVE-2026-41907: limites de buffers de uuid](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq)
  e o [backport CommonJS 11.1.1](https://github.com/uuidjs/uuid/releases/tag/v11.1.1).

Os consumidores legados inspecionados usam `uuid.v4()` sem argumentos. Foram
testados a resolução real do pacote a partir desses consumidores, a geração de
UUID válido, a rejeição de buffers insuficientes em `v3`/`v5`/`v6`, o limite de
arrays de `qs` e entradas com `constructor.isBuffer` malformado. Importação e
inicialização local dos SDKs Admin/Firestore/Functions também foram verificadas,
sem chamadas aos dados de produção.

O relatório de auditoria de dependências é separado dos achados estáticos do
GitGuard. Não se deve tratar um retorno de `npm audit` em modo offline como
evidência de ausência de vulnerabilidades; nesta revisão a consulta foi online.

As limitações de negócio e implantação documentadas anteriormente em
`security-audit.md`, incluindo compatibilidade com o APK e migração dos aliases
de login, continuam exigindo revisão antes de publicar o checkout completo.

Resultados finais da instalação, auditoria e testes serão registrados ao término
das verificações desta revisão.
