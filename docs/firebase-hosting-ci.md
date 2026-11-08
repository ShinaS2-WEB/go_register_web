# Publicação automática no Firebase Hosting

O workflow `.github/workflows/firebase-hosting.yml` publica a branch `main`
no projeto `goregister-7394b`, após os testes. A autenticação usa Workload
Identity Federation, sem chave privada de conta de serviço.

O ambiente `production` do GitHub contém as configurações esperadas pelo
workflow: `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` e
`FIREBASE_PROJECT_ID`. Em 08/11/2026, a ausência desses valores causava a falha
na etapa de autenticação; o pool, o provedor e os valores foram configurados.

A conta `github-hosting@goregister-7394b.iam.gserviceaccount.com` tem somente
os papéis de administração do Hosting e consumo de APIs. O provedor valida os
IDs do repositório e do proprietário, a branch `main`, o ambiente `production`
e o caminho exato do workflow de Hosting.

Essa identidade não autoriza publicação de regras, Functions ou alterações
de dados. O workflow manual de backend exige sua própria configuração e
permissões; não ampliar a conta de Hosting para fazê-lo funcionar.

Para publicar localmente com a sessão Firebase autenticada:

```powershell
npx firebase deploy --only hosting --project goregister-7394b
```

O `firebase.json` exclui pastas ocultas recursivamente, caches, testes, scripts,
documentação e arquivos de backend da publicação.

Referência: https://github.com/google-github-actions/auth
