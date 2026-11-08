# Controle de atualização do APK

O painel mestre possui a seção **Atualização do APK**. Ela grava somente metadados
no documento `public_config/android_update`; nenhum APK ou token do GitHub é enviado
pelo JavaScript do site.

Fluxo de publicação:

1. Gere e teste um APK com código de versão maior e a mesma assinatura.
2. Publique o arquivo em um Release de `ShinaS2-WEB/go_Register_apk`.
3. Calcule o SHA-256 e confirme que o link funciona sem login.
4. Preencha o painel e salve inicialmente com **Exibir esta atualização** desmarcado.
5. Ative a atualização opcional e teste em uma empresa.
6. Somente depois ajuste o código mínimo para torná-la obrigatória.

As regras permitem leitura pública apenas do documento exato usado pelo aplicativo.
Somente um administrador ativo da plataforma pode criar ou alterar a configuração.
Links fora dos Releases oficiais, HTTP, campos extras e códigos incoerentes são
rejeitados.
