# Correção do acesso da empresa testes — 2026-11-08

O diagnóstico em produção confirmou que a empresa estava ativa e sem limpeza
pendente, mas não tinha projeção em `company_access`. As regras publicadas
também não continham esse caminho, embora o frontend já o utilizasse.

Após autorização explícita, foi criada somente a projeção dessa empresa,
contendo `companyId`, `name` e `logoUrl`. Nenhum documento operacional foi
modificado. Foi acrescentado o bloco de acesso às regras então publicadas,
preservando todos os demais blocos. Não foi publicado o conjunto completo de
alterações locais de `firestore.rules`, que inclui outras mudanças anteriores.

A adição permite consulta individual da projeção válida de empresa ativa;
listagem, criação, edição e exclusão exigem administrador da plataforma.
Criação e edição validam os três campos permitidos. Campos privados adicionais
impedem a leitura pública.

Validação: nove verificações no emulador, cobrindo leitura ativa, empresa
inativa, limpeza pendente, registro ausente, campos privados, listagem pública,
gravação anônima, criação administrativa válida e edição com campo proibido.
Depois da publicação, a consulta real sem autenticação retornou HTTP 200 e
o vínculo esperado com a empresa. Isso valida a descoberta da empresa; não
representa um teste de login de usuário com senha.

A correção foi restrita à empresa informada. Não foi executada uma migração
geral nem publicado o frontend ou backend. Antes de uma publicação futura das
regras locais completas, revisar as outras diferenças já existentes em relação
à produção e a implantação coordenada descrita em `security-audit.md`.
