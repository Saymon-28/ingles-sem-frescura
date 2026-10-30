// Servidor da conversa livre (Cloudflare Worker).
// Guarda a chave da Anthropic em segredo e fala com a IA no lugar do app.
// Variáveis a configurar no painel da Cloudflare:
//   ANTHROPIC_API_KEY  (segredo)  chave da API da Anthropic
//   APP_TOKEN          (segredo)  senha que você inventa; o app envia no cabeçalho
//   ALLOWED_ORIGIN     (texto)    https://saymon-28.github.io

const MODEL = 'claude-haiku-5-5';
const MOODS = ['calma', 'direta', 'durona'];
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LEVEL_STYLE = {
  A1: 'Use very simple English: very short sentences, common words, present tense.',
  A2: 'Use simple English: short sentences, everyday vocabulary, basic past and future.',
  B1: 'Use clear standard English with some idioms; moderate sentence length.',
  B2: 'Use natural English with varied tenses, phrasal verbs and connectors.',
  C1: 'Use fluent, nuanced English with idioms and abstract topics.',
  C2: 'Use sophisticated, near-native English with subtle register and idiom.'
};

const json = (obj, status, cors) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });

function systemPrompt({ mood, adult, level, pt, name, topic, scenario }) {
  const tone = {
    calma: 'Be patient, warm and encouraging. Never rush the student.',
    direta: 'Be blunt and concise. No small talk, no cheering. Short corrections.',
    durona:
      'Be a tough, sarcastic teacher. Tease the student in Brazilian Portuguese using mild swearing (porra, caralho, merda, cacete, anta, burro) as playful roasting of their mistakes. ' +
      'Never use slurs, never insult race, gender, sexuality, religion, disability, nationality, body or family, and never threaten anyone. ' +
      'If the student is clearly upset or struggling emotionally, drop the roasting and be kind.'
  }[mood === 'durona' && !adult ? 'direta' : mood];

  return [
    'You are "Professora", an English teacher for Brazilian Portuguese speakers, chatting in a language-learning app.',
    `Student name: ${name || 'unknown'}. CEFR level: ${level}. Topic: ${topic || 'free choice'}.`,
    scenario
      ? `ROLEPLAY SCENARIO (set by the student): "${scenario}". You play the other person in this scene (e.g. airline agent, interviewer, waiter). Stay in character, set the scene in your first message, ask ONE question at a time and react to the student answers like that person would. The student should do most of the talking.`
      : 'No fixed scenario: chat naturally and keep the student talking.',
    `Tone: ${tone}`,
    LEVEL_STYLE[level],
    'Keep the language strictly at the student level so it is understandable, with at most one slightly harder word per reply.',
    pt === 'pt'
      ? 'Write explanations and corrections in Brazilian Portuguese; keep the conversation itself in English.'
      : 'Keep explanations minimal and mostly in English; use Portuguese only when the student is lost.',
    'Every reply must keep the conversation going with one short question. Max 60 words in "reply".',
    'If the student\'s last message had a mistake, give the fix in "correction" (example: Você disse "I goed" → "I went" (passado de go)). Otherwise "correction" is null.',
    '"translation" is a Brazilian Portuguese translation of "reply".',
    'If there is no student message yet, greet the student and ask a first simple question.',
    'Output ONLY valid JSON: {"reply": string, "correction": string|null, "translation": string}. No markdown.'
  ].join('\n');
}

export default {
  async fetch(req, env) {
    const allowed = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin'
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'use POST' }, 405, cors);

    if (allowed !== '*' && req.headers.get('Origin') !== allowed) return json({ error: 'origem não permitida' }, 403, cors);
    if (!env.APP_TOKEN || req.headers.get('X-App-Token') !== env.APP_TOKEN) return json({ error: 'senha incorreta' }, 401, cors);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'servidor sem chave da API' }, 500, cors);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400, cors); }

    const mood = MOODS.includes(body.mood) ? body.mood : 'calma';
    const level = LEVELS.includes(body.level) ? body.level : 'A1';
    const opts = {
      mood, level,
      adult: body.adult === true,
      pt: body.pt === 'en' ? 'en' : 'pt',
      name: String(body.name || '').slice(0, 20),
      topic: String(body.topic || '').slice(0, 40),
      scenario: String(body.scenario || '').slice(0, 200)
    };

    let msgs = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12)
      .map(m => ({ role: m.role, content: m.content.slice(0, 500) }));
    if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: '(start the conversation)' });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system: systemPrompt(opts), messages: msgs })
    });
    if (!r.ok) return json({ error: 'erro da IA (' + r.status + ')' }, 502, cors);

    const data = await r.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    let out;
    try { out = JSON.parse(text.replace(/^```json\s*|```$/g, '').trim()); }
    catch { out = { reply: text.trim(), correction: null, translation: '' }; }

    return json({
      reply: String(out.reply || '').slice(0, 600),
      correction: out.correction ? String(out.correction).slice(0, 400) : null,
      translation: String(out.translation || '').slice(0, 600)
    }, 200, cors);
  }
};
