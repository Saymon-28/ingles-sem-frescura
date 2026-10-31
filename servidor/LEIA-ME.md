# Servidor da IA (opcional)

O app funciona sem isto (cenários, conversa aleatória por regras, pronúncia, palavras, jogos, progresso).
Este servidor liga a **IA**: conversa livre e cenários criados por você, correção que entende qualquer frase,
nota por resposta e a **Análise com IA** na aba Progresso.

Nenhuma chave vai para o app nem para o GitHub: ela fica guardada só no servidor.

## Escolha uma IA

**A) Workers AI da Cloudflare (recomendado para começar)**
Não precisa de chave nem de cartão. Tem uma cota diária gratuita (confira o limite atual no painel da Cloudflare).
A qualidade é boa para conversa simples e um pouco menor que a do Claude.

**B) Claude (Anthropic)**
Melhor qualidade, cobrado por uso. Crie a chave em https://console.anthropic.com, adicione crédito e defina um limite de gasto.

## Passo a passo

1. Crie uma conta grátis em https://dash.cloudflare.com
2. **Workers & Pages → Create → Create Worker** (nome: `ingles-professora`) → **Deploy**.
3. Clique em **Edit code**, apague tudo, cole o conteúdo de `worker.js` e clique em **Deploy**.
4. Em **Settings → Variables and Secrets**, adicione:
   - `APP_TOKEN` (tipo **Secret**): uma senha que você inventa
   - `ALLOWED_ORIGIN` (tipo **Text**): `https://saymon-28.github.io`
   - só para a opção B: `ANTHROPIC_API_KEY` (tipo **Secret**) com a chave
5. Só para a opção A: em **Settings → Bindings → Add → Workers AI**, use o nome de variável `AI` e salve.
6. Faça **Deploy** de novo e copie o endereço do worker (termina com `.workers.dev`).

## No app
**Perfil → Conversa livre**: cole o endereço e a senha, toque em **Salvar** e **Testar conexão**.
Depois use **Conversa aleatória**, **Crie seu próprio cenário** (aba Cenários) e **Gerar análise** (aba Progresso).
