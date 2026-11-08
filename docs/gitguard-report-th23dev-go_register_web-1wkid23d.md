# Relatório de Segurança — th23dev/go_register_web

**Scan:** `cmv2sgsoy0frrk0a21wkid23d` · MANUAL · branch `main` · commit `69eae234fc16`
**Status:** COMPLETED · **Executado em:** 2026-10-10T19:30:09.284Z · **Concluído em:** 2026-10-10T19:34:49.162Z
**Relatório gerado em:** 2026-10-10T19:36:18.217Z por GitGuard

## Instruções para a IA que for corrigir isto

- Repositório alvo: th23dev/go_register_web, branch "main", commit 69eae234fc1614df561f9bcef7e7f7be91392d25. Aplique as correções diretamente nesse checkout.
- Em "dependencyUpgrades", cada entrada agrupa TODOS os CVEs de um mesmo pacote — faça UM upgrade por pacote (para "recommendedVersion" ou mais recente), não uma correção por CVE.
- Em "secrets", nunca tente adivinhar ou reconstruir o valor original do segredo (ele foi propositalmente redigido) — apenas remova/rotacione conforme "remediation".
- Depois de aplicar as correções, rode os testes existentes do projeto e, se disponível, o linter/build antes de considerar concluído.

## Resumo

- **Total de findings:** 24
- **Por severidade:** HIGH: 3 · MEDIUM: 20 · LOW: 1
- **Por scanner:** SEMGREP: 19 · GITLEAKS: 2 · TRIVY: 3

## Dependências para atualizar

### 📦 `qs` (2 CVEs) — severidade máxima: MEDIUM

**Ação recomendada:** atualizar de `6.15.3` para `6.16.0` (ou superior).

| Severidade | CVE | Descrição | Corrigido em |
|---|---|---|---|
| MEDIUM | CVE-2026-82562 | qs: qs: Denial of Service via array limit bypass in query string parsing | 6.16.0 |
| MEDIUM | CVE-2026-82417 | qs: qs: Denial of Service via improper validation in stringify function | 6.16.0 |

### 📦 `uuid` (1 CVE) — severidade máxima: MEDIUM

**Ação recomendada:** atualizar de `9.0.1` para `11.1.1, 12.0.1, 13.0.1` (ou superior).

| Severidade | CVE | Descrição | Corrigido em |
|---|---|---|---|
| MEDIUM | CVE-2026-41907 | uuid: uuid: Out-of-bounds write vulnerability impacts data integrity and confidentiality | 11.1.1, 12.0.1, 13.0.1 |

## Segredos expostos

### 🔑 admin/admin.js:5 — Secret detected: Uncovered a GCP API key, which could lead to unauthorized access to Google Cloud services and data breaches. (HIGH)

Regra: `gcp-api-key`

**Remediação:** Remova o valor do código-fonte e mova para uma variável de ambiente / secret manager. Se for uma credencial real (não um placeholder de exemplo), revogue-a imediatamente — ela já está exposta no histórico do Git mesmo após removida do arquivo atual.

### 🔑 app.js:48 — Secret detected: Uncovered a GCP API key, which could lead to unauthorized access to Google Cloud services and data breaches. (HIGH)

Regra: `gcp-api-key`

**Remediação:** Remova o valor do código-fonte e mova para uma variável de ambiente / secret manager. Se for uma credencial real (não um placeholder de exemplo), revogue-a imediatamente — ela já está exposta no histórico do Git mesmo após removida do arquivo atual.

## Outros findings

| Severidade | Scanner | Categoria | Título | Local |
|---|---|---|---|---|
| HIGH | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.generic.hardcoded_secrets.node_password | /scan/assets/firebase/firebase-auth.js:1 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | /scan/.github/workflows/firebase-hosting.yml:25 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.timing_attack_node.node_timing_attack | /scan/admin/admin.js:249 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.generic.error_disclosure.generic_error_disclosure | /scan/assets/firebase/firebase-auth.js:1 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | /scan/assets/firebase/firebase-auth.js:1 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp | /scan/assets/firebase/firebase-auth.js:1 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | /scan/.github/workflows/firebase-deploy.yml:14 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | /scan/.github/workflows/firebase-deploy.yml:15 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | /scan/.github/workflows/firebase-deploy.yml:32 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | /scan/.github/workflows/firebase-deploy.yml:33 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | /scan/.github/workflows/firebase-deploy.yml:38 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | /scan/.github/workflows/firebase-hosting.yml:22 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | /scan/.github/workflows/firebase-hosting.yml:37 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | /scan/.github/workflows/pages.yml:25 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | /scan/.github/workflows/pages.yml:41 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | /scan/.github/workflows/pages.yml:44 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | /scan/.github/workflows/pages.yml:50 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.dos.regex_dos.regex_dos | /scan/admin/admin.js:38 |
| LOW | SEMGREP | SAST | Semgrep Finding: rules.javascript.audit.detect-replaceall-sanitization.detect-replaceall-sanitization | /scan/admin/admin.js:8 |
