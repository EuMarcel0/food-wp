import { Router } from "express";

export const legalRouter = Router();

function page(title: string, body: string) {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · Food WP</title>
    <style>
      body { font-family: sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; line-height: 1.5; color: #111; }
      h1 { font-size: 1.5rem; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    ${body}
  </body>
</html>`;
}

legalRouter.get("/privacidade", (_req, res) => {
  res
    .type("html")
    .send(
      page(
        "Política de privacidade",
        `<p>O Food WP é um sistema de pedidos pelo WhatsApp e um painel de retaguarda para o estabelecimento.</p>
<p>Coletamos nome e número de WhatsApp do cliente, itens do pedido, endereço de entrega (quando informado) e dados de acesso dos usuários do painel (e-mail e nome).</p>
<p>Esses dados servem só para receber o pedido, preparar, entregar e comunicar o status. Não vendemos informações a terceiros.</p>
<p>O processamento das mensagens passa pela Cloud API da Meta. O armazenamento fica no nosso banco e servidores.</p>
<p>Para dúvidas ou exclusão de dados, use o e-mail de contato cadastrado no app Food WP.</p>`,
      ),
    );
});

legalRouter.get("/termos", (_req, res) => {
  res
    .type("html")
    .send(
      page(
        "Termos de uso",
        `<p>O Food WP permite que o cliente faça pedidos pelo WhatsApp e que a loja gerencie cardápio, categorias e status dos pedidos no painel.</p>
<p>O uso do bot implica o envio de mensagens necessárias ao pedido. O estabelecimento é responsável pelo cardápio, preços, preparo e entrega.</p>
<p>O serviço pode ser interrompido para manutenção. Não substituímos obrigações legais do estabelecimento perante o consumidor.</p>`,
      ),
    );
});

legalRouter.get("/exclusao", (_req, res) => {
  res
    .type("html")
    .send(
      page(
        "Exclusão de dados",
        `<p>Para apagar dados do pedido, da conversa no WhatsApp ou da conta do painel, envie um e-mail ao contato do app Food WP pedindo a exclusão.</p>
<p>Vamos remover ou anonimizar os dados pessoais que não precisarmos mais guardar por obrigação legal (por exemplo, registro fiscal do pedido, se houver).</p>
<p>A exclusão da conta no painel encerra o acesso daquele usuário. Pedidos já feitos podem ser mantidos de forma anonimizada para histórico da loja.</p>`,
      ),
    );
});
