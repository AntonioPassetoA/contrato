# Segurança — chave de criptografia e proxy

## DATA_ENCRYPTION_KEY (dados pessoais dos clientes)

Os dados pessoais preenchidos pelo cliente (`form_data`: nome, CPF/CNPJ, RG, endereço,
telefone, e-mail) são gravados **criptografados** no banco com **AES-256-GCM**. A chave
vem **exclusivamente** da variável de ambiente `DATA_ENCRYPTION_KEY` e **nunca** é
versionada no Git.

### ⚠ Perda da chave = dados irrecuperáveis

- Se a `DATA_ENCRYPTION_KEY` for **perdida**, os dados pessoais já gravados **não podem
  mais ser descriptografados**. Não há recuperação possível — é uma propriedade do
  algoritmo, não uma limitação do sistema.
- **Trocar** a chave também invalida tudo o que já estava criptografado com a chave antiga
  (seria necessário um processo de re-criptografia com a chave antiga ainda disponível).

### Como guardar e fazer backup (produção)

1. Gere uma chave forte e aleatória:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`
2. Armazene-a **apenas** no **gerenciador de segredos** da hospedagem
   (ex.: variáveis de ambiente seguras do provedor / secret manager). Nunca em código,
   commit, imagem de container, print, chat ou e-mail.
3. Faça **backup seguro** da chave em um cofre separado do banco de dados (se o backup
   ficar junto do banco, um vazamento comprometeria ambos). Ex.: cofre de senhas da
   empresa com acesso restrito.
4. Restrinja o acesso a poucas pessoas e registre quem tem acesso.
5. Em **produção** (`NODE_ENV=production`), a ausência/invalidez da chave **bloqueia** o
   acesso aos dados pessoais — o sistema não expõe PII sem uma chave válida.

## TRUST_PROXY (rate limit atrás de proxy)

Atrás do proxy da hospedagem, todos os clientes chegam com o IP do proxy. Para o rate
limit funcionar por cliente **sem** confiar em cabeçalhos manipuláveis:

- `TRUST_PROXY` vazio/`0`/`false` → não confia (desenvolvimento, sem proxy).
- `TRUST_PROXY=1` → confia em **1** proxy à frente (produção típica). O Express passa a
  usar o IP real do cliente a partir do `X-Forwarded-For`, considerando 1 salto confiável.
- Ajuste o número conforme a quantidade de proxies/edge à frente do app.
- **Não** use `true` em produção: confiaria em qualquer `X-Forwarded-For` enviado pelo
  cliente, permitindo burlar o rate limit.
