# Food WP · Agente de impressão

Serviço local para o **PC da cozinha**. Imprime cupons ESC/POS sem diálogo do navegador e **sem Node** na loja.

## Produção (loja)

```bash
cd print-agent
npm install
npm run build:exe
```

Saída: `release/FoodWpPrint/`

Na loja (como **Administrador**):

1. Copie a pasta `FoodWpPrint`
2. Execute `install.ps1` → registra o **serviço Windows** `Food WP Print Agent`
3. Painel → Configurações → Impressão → **Conectar agente**
4. Escolha a impressora e salve

O serviço inicia com o Windows, **sem janela**. Funcionários não precisam (nem devem) abrir o `.exe` manualmente.

- Status: `services.msc` → Food WP Print Agent  
- Remover: `uninstall.ps1` como Administrador  

## Desenvolvimento

```bash
npm start
```
