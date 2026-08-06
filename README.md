# Coletor de Contratos — integrado ao Autentique

Sistema interno que automatiza o **preenchimento** de contratos do Autentique. O admin gera um link único por cliente; o cliente abre um formulário simples (mobile-first), preenche seus dados; o sistema monta o contrato, **gera o PDF**, cria o documento no Autentique e devolve o **link de assinatura** — sem preenchimento manual no painel.

> O Autentique continua sendo usado para assinar. Este sistema **não substitui** o Autentique — só automatiza o preenchimento e o envio.

## Como funciona

1. **Admin** escolhe o modelo, informa valor/vencimento e gera um link.
2. Envia o link ao cliente (botão de WhatsApp no painel).
3. **Cliente** abre o link, escolhe Pessoa Física ou Jurídica e preenche o formulário (com máscara e busca de endereço por CEP).
4. Ao enviar, o sistema gera o PDF, cria o documento no Autentique com os signatários fixos + o cliente, e mostra o botão **"Assinar contrato"**.
5. O painel acompanha o status: *pendente → aguardando assinatura → assinado*.

## Requisitos

- **Node.js 22 ou superior** (usa o SQLite nativo do Node — sem banco externo).
- Na VPS, dependências do Chromium (para o Puppeteer gerar o PDF) — ver seção de deploy.

## Estrutura

```
contrato/
├── server/        Backend (Node + TypeScript + SQLite nativo + Puppeteer)
│   └── src/
│       ├── templates/   Modelos de contrato (registry). Piloto: Plano Prata.
│       ├── autentique.ts, pdf.ts, contracts.ts, validators.ts, auth.ts
│       └── routes/      admin, público, webhook
├── web/           Frontend (React + Vite + Tailwind)
├── ecosystem.config.cjs   Configuração do PM2
├── deploy/nginx.exemplo.conf
└── .env           Configuração (copie de .env.example)
```

## Configuração (.env)

Copie `.env.example` para `.env` e preencha:

| Variável | Para que serve |
|---|---|
| `AUTENTIQUE_TOKEN` | Token da API (painel Autentique > perfil > API). |
| `PORT` | Porta do backend (padrão 3333). |
| `PUBLIC_BASE_URL` | URL pública (usada nos links do cliente). Em produção, seu domínio. |
| `ADMIN_PASSWORD` | Senha de acesso ao painel. |
| `SESSION_SECRET` | Segredo aleatório para a sessão do admin. |
| `AUTENTIQUE_SANDBOX` | `true` = modo teste (sem custo). `false` = produção. |
| `AUTENTIQUE_WEBHOOK_SECRET` | Segredo do webhook (opcional). |
| `LINK_EXPIRATION_DAYS` | Validade padrão dos links (dias). |

> ⚠️ Deixe `AUTENTIQUE_SANDBOX=true` enquanto testa. Documentos em sandbox **não geram custo** e **não valem como contrato**. Mude para `false` só quando for pra valer.

## Rodar localmente

```bash
# 1) Instalar dependências (backend + frontend)
npm run install:all

# 2) Backend (terminal 1) — serve a API na porta 3333
npm run dev:server

# 3) Frontend (terminal 2) — Vite em http://localhost:5173 (proxy /api -> 3333)
npm run dev:web
```

Acesse o painel em `http://localhost:5173/admin` (senha do `.env`).

## Deploy na VPS (PM2 + Nginx)

```bash
# 0) Instalar Node 22+ e PM2
sudo npm install -g pm2

# 1) Dependências do Chromium (Ubuntu/Debian) para o Puppeteer
sudo apt-get update && sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0

# 2) Na pasta do projeto: instalar deps e buildar o frontend
npm run install:all
npm run build:web        # gera web/dist (servido pelo próprio backend)

# 3) Configurar o .env (ajuste PUBLIC_BASE_URL, ADMIN_PASSWORD, SESSION_SECRET,
#    e AUTENTIQUE_SANDBOX=false quando for produção)

# 4) Subir com PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup            # para iniciar junto com o servidor

# 5) Nginx como reverse proxy
sudo cp deploy/nginx.exemplo.conf /etc/nginx/sites-available/contratos
# edite o server_name, então:
sudo ln -s /etc/nginx/sites-available/contratos /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

O backend serve o frontend buildado (`web/dist`) na mesma porta — não é preciso rodar o Vite em produção.

### Webhook (opcional, recomendado)

No painel do Autentique, cadastre o webhook apontando para:

```
https://SEU_DOMINIO/api/webhook/autentique
```

Defina um segredo e coloque o mesmo valor em `AUTENTIQUE_WEBHOOK_SECRET`. Assim o status "assinado" atualiza sozinho (sem precisar clicar em "Atualizar status" no painel).

## Adicionar novos modelos de contrato

> A API do Autentique **não expõe** os modelos do painel, então cada modelo vive aqui no sistema como texto com marcadores.

1. Crie `server/src/templates/nome-do-modelo.ts` seguindo o exemplo de `plano-prata.ts`
   (defina `campos`, `signatariosFixos`, `camposAdmin` e a função `render`).
2. Registre-o em `server/src/templates/registry.ts`.
3. Reinicie o backend. O modelo aparece automaticamente no painel.

## Auditoria

Toda operação (link gerado, PDF gerado, documento criado, erros, webhooks) fica registrada
na tabela `logs` do banco (`server/data/contratos.sqlite`) e no console/logs do PM2.
