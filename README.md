# Food WP Bot

Retaguarda e bot de WhatsApp para food service (pizzaria, lanchonete, hamburgueria e afins). O cliente conversa no WhatsApp; a cozinha atualiza o status neste painel.

## Estrutura

- `backend` — Node + TypeScript + Express. Webhook da Cloud API, fluxo do pedido e API da retaguarda.
- `frontend` — React + Vite + TypeScript + Ant Design. Painel de pedidos e cardápio.
- `supabase` — schema e seed genéricos.

Sem as chaves reais, a API sobe em **modo memória** (cardápio demo) e o WhatsApp fica em **dry-run** (loga a resposta no terminal).

## Como rodar

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm install
npm run dev
```

- Painel: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:4000/health](http://localhost:4000/health)
- Webhook: `POST/GET http://localhost:4000/webhook/whatsapp`

## Variáveis

### `backend/.env`

| Variável | Uso |
| --- | --- |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — só no backend |
| `WHATSAPP_TOKEN` | Token da Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número no Meta |
| `WHATSAPP_VERIFY_TOKEN` | Token que você inventa para o webhook |
| `WHATSAPP_APP_SECRET` | Secret do app Meta (assinatura do webhook) |
| `DEFAULT_STORE_ID` | UUID da loja do `seed.sql` |

### `frontend/.env`

| Variável | Uso |
| --- | --- |
| `VITE_API_URL` | URL da API (`http://localhost:4000`) |
| `VITE_SUPABASE_URL` | Mesma URL do projeto |
| `VITE_SUPABASE_ANON_KEY` | Chave anon — só leitura/realtime |

## Supabase

No SQL Editor do projeto:

1. cole e rode `supabase/migrations/apply_all.sql` (ou os arquivos `001`–`008` na ordem)
2. em **Authentication → Providers**, deixe **Email** ligado (e-mail + senha)
3. se não quiser confirmar e-mail no começo, desative *Confirm email* em Authentication → Providers → Email

O painel (`/login` e `/cadastro`) usa só esse Auth. Sem as chaves do frontend, as telas abrem mas o formulário fica bloqueado; o restante do app continua em modo demo.

## PWA

O frontend tem manifesto e service worker. Depois do `npm run dev` ou do build, o navegador permite instalar no celular ou no desktop (standalone). Ícones em `frontend/public/icons`.

## WhatsApp

1. Crie o app em [Meta for Developers](https://developers.facebook.com/docs/whatsapp/cloud-api/overview/)
2. Aponte o webhook para uma URL pública HTTPS (ngrok, Cloudflare Tunnel, etc.) + `/webhook/whatsapp`
3. Use o mesmo `WHATSAPP_VERIFY_TOKEN` do `.env`
4. Envie uma mensagem no número de teste — o bot responde com cardápio, pedido e status

## Fluxo do bot

1. Ver cardápio / Fazer pedido / Status
2. Escolher item e quantidade
3. Entrega ou retirada
4. Pagamento (Pix, dinheiro, cartão)
5. Código do pedido e avisos quando a retaguarda muda o status
