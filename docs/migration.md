# Migração segura

Nenhuma migração roda no deploy. Antes de migrar produção:

1. Exporte o Firestore com `gcloud firestore export`.
2. Execute o diagnóstico em credenciais de homologação.
3. Execute `npm run migrate:dry-run` e revise o JSON de relatório.
4. Só então use `npm run migrate:apply`, em janela controlada. O comando exige confirmação explícita de backup.

O migrador deve ser reiniciável: ele só adiciona campos canônicos ausentes e nunca troca IDs nem apaga campos legados. O relatório precisa contar analisados, alterados, ignorados, inválidos e erros. O Android deve ser atualizado conforme `firestore-data-contract.md` antes da escrita canônica obrigatória.
