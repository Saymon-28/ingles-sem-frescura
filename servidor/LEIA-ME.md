# Servidor da conversa livre (opcional)

O app funciona sem isto (situações, pronúncia, palavras, jogos). Este servidor só liga a **Conversa livre com IA**.
Ele guarda a sua chave da IA em segredo; a chave nunca vai para o app nem para o GitHub.

Custo: a Cloudflare é grátis para esse uso. A IA da Anthropic cobra por uso (o modelo usado é o mais barato).

## 1. Chave da IA
1. Entre em https://console.anthropic.com e crie uma conta.
2. Em **Billing**, adicione crédito (alguns dólares bastam) e defina um **limite de gasto mensal**.
3. Em **API keys**, crie uma chave e copie (começa com `sk-ant-`).

## 2. Servidor na Cloudflare
1. Crie conta grátis em https://dash.cloudflare.com
2. **Workers & Pages → Create → Create Worker** (nome: `ingles-professora`) → **Deploy**.
3. Clique em **Edit code**, apague tudo, cole o conteúdo de `worker.js` e clique em **Deploy**.
4. Em **Settings → Variables and Secrets**, adicione:
   - `ANTHROPIC_API_KEY` (tipo **Secret**): a chave do passo 1
   - `APP_TOKEN` (tipo **Secret**): uma senha que você inventa
   - `ALLOWED_ORIGIN` (tipo **Text**): `https://saymon-28.github.io`
5. Copie o endereço do worker (termina com `.workers.dev`).

## 3. No app
**Perfil → Conversa livre**: cole o endereço e a senha, toque em **Salvar** e **Testar conexão**.
Depois é só abrir a aba **Conversar**.
