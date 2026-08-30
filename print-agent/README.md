# Food WP · Agente de impressão

Serviço local para o **PC da cozinha**. Imprime cupons ESC/POS (Elgin i8 etc.) sem diálogo do navegador e **sem precisar instalar Node** na loja (use o pacote `.exe`).

## Para a loja (produção)

No PC de desenvolvimento, gere o pacote:

```bash
cd print-agent
npm install
npm run build:exe
```

Saída: `print-agent/release/FoodWpPrint/`

| Arquivo | Uso |
|---------|-----|
| `food-wp-print-agent.exe` | Agente |
| `install.ps1` | Instala e inicia com o Windows |
| `uninstall.ps1` | Remove |
| `LEIA-ME.txt` | Instruções |

Na loja: copie a pasta, execute `install.ps1`, abra o painel → **Configurações → Impressão → Conectar agente**.

## Desenvolvimento (com Node)

```bash
npm install
npm start
```

API em `http://127.0.0.1:19100` (somente localhost).
