// Servidor da IA do app (Cloudflare Worker).
// Faz duas coisas: conversa/cenários com correção e análise de desempenho.
// Funciona com UMA destas IAs (use a que preferir):
//   A) Workers AI da própria Cloudflare (tem cota diária gratuita): adicione o binding "AI".
//   B) Claude (Anthropic): adicione o segredo ANTHROPIC_API_KEY (pago por uso).
// Variáveis no painel da Cloudflare:
//   APP_TOKEN        (segredo)  senha que você inventa; o app envia no cabeçalho
//   ALLOWED_ORIGIN   (texto)    https://saymon-28.github.io
//   ANTHROPIC_API_KEY (segredo, opcional) se for usar o Claude
//   AI_MODEL         (texto, opcional) troca o modelo do Workers AI

const ANTHROPIC_MODEL = 'claude-haiku-5-5';
const WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';
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

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

function toneFor(mood, adult) {
  const m = mood === 'durona' && !adult ? 'direta' : mood;
  return {
    calma: 'Be patient, warm and encouraging. Never rush the student.',
    direta: 'Be blunt and concise. No small talk, no cheering. Short corrections.',
    durona:
      'Be a tough, sarcastic teacher. Tease the student in Brazilian Portuguese using mild swearing (porra, caralho, merda, cacete, anta, burro) as playful roasting of their mistakes. ' +
      'Never use slurs, never insult race, gender, sexuality, religion, disability, nationality, body or family, and never threaten anyone. ' +
      'If the student is clearly upset or struggling emotionally, drop the roasting and be kind.'
  }[m];
}

function chatPrompt({ mood, adult, level, pt, name, topic, scenario }) {
  return [
    'You are "Professora", an English teacher for Brazilian Portuguese speakers, chatting in a language-learning app.',
    `Student name: ${name || 'unknown'}. CEFR level: ${level}. Topic: ${topic || 'free choice'}.`,
    scenario
      ? `ROLEPLAY SCENARIO (set by the student): "${scenario}". You play the other person in this scene (e.g. airline agent, interviewer, waiter). Stay in character, set the scene in your first message, ask ONE question at a time and react to the student answers like that person would. The student should do most of the talking.`
      : 'No fixed scenario: have a realistic, natural conversation. React to what the student said (show interest, share a short remark of your own), then ask ONE follow-up question related to their answer.',
    `Tone: ${toneFor(mood, adult)}`,
    LEVEL_STYLE[level],
    'Keep the language strictly at the student level so it is understandable, with at most one slightly harder word per reply.',
    pt === 'pt'
      ? 'Write explanations and corrections in Brazilian Portuguese; keep the conversation itself in English.'
      : 'Keep explanations minimal and mostly in English; use Portuguese only when the student is lost.',
    'Every reply must keep the conversation going with one short question. Max 60 words in "reply".',
    'Always evaluate the student last message (if any): "corrected" = the student sentence fixed (or the same sentence if it was already correct); "suggestion" = a more natural or richer way to say it; "correction" = a short explanation in Portuguese of what was wrong (null if nothing); "score" = 0-100 for grammar, vocabulary and naturalness. If there is no student message yet, set corrected, suggestion, correction and score to null.',
    '"translation" is a Brazilian Portuguese translation of "reply".',
    'Output ONLY valid JSON: {"reply": string, "correction": string|null, "corrected": string|null, "suggestion": string|null, "translation": string, "score": number|null}. No markdown.'
  ].join('\n');
}

function insightPrompt({ mood, adult, level, pt, name }) {
  return [
    'You are an English learning coach analyzing the activity data of a Brazilian Portuguese speaker using a practice app.',
    `Student name: ${name || 'unknown'}. Current CEFR level: ${level}.`,
    `Tone: ${toneFor(mood, adult)}`,
    'You receive JSON with: goalPerDay, streak, days (last 14 days: n=activities, acc=% accuracy, xp), kinds (accuracy per skill: vocab, conv, scen, pron), topErrors (recurring grammar mistakes), weakWords, flags (counts of short answers, answers in Portuguese, answers without connectors, total conversation answers) and recent (last answers with scores and corrections).',
    'Write in Brazilian Portuguese. Be specific and use the real numbers. Do not invent data. If there is little data, say so and suggest how to start.',
    'Output ONLY valid JSON: {"summary": string (2-3 sentences with the overall picture and trend), "strengths": [string, max 3], "improvements": [string, max 4, each tied to concrete evidence such as a recurring error or weak skill], "plan": [string, exactly 3 concrete steps for tomorrow inside the app], "motivation": string (one short sentence)}. No markdown.'
  ].join('\n');
}

async function llm(env, system, messages, maxTokens) {
  if (env.ANTHROPIC_API_KEY) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages })
    });
    if (!r.ok) throw new Error('erro da IA (' + r.status + ')');
    const d = await r.json();
    return (d.content && d.content[0] && d.content[0].text) || '';
  }
  if (env.AI) {
    const out = await env.AI.run(env.AI_MODEL || WORKERS_AI_MODEL, {
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: maxTokens
    });
    const t = out && (out.response || (out.result && out.result.response));
    return typeof t === 'string' ? t : JSON.stringify(t || '');
  }
  throw new Error('servidor sem IA: adicione o binding AI ou a chave ANTHROPIC_API_KEY');
}

function parseJSON(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

const strOrNull = (v, n) => (v == null || v === '' ? null : clip(v, n));
const list = (v, n, len) => (Array.isArray(v) ? v.slice(0, n).map(x => clip(x, len)) : []);

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

    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400, cors); }

    const opts = {
      mood: MOODS.includes(body.mood) ? body.mood : 'calma',
      level: LEVELS.includes(body.level) ? body.level : 'A1',
      adult: body.adult === true,
      pt: body.pt === 'en' ? 'en' : 'pt',
      name: clip(body.name, 20),
      topic: clip(body.topic, 40),
      scenario: clip(body.scenario, 200)
    };

    try {
      if (body.mode === 'insights') {
        const stats = clip(JSON.stringify(body.stats || {}), 6000);
        const text = await llm(env, insightPrompt(opts), [{ role: 'user', content: stats }], 900);
        const o = parseJSON(text) || { summary: text.trim(), strengths: [], improvements: [], plan: [], motivation: '' };
        return json({
          summary: clip(o.summary, 600),
          strengths: list(o.strengths, 3, 300),
          improvements: list(o.improvements, 4, 300),
          plan: list(o.plan, 3, 300),
          motivation: clip(o.motivation, 200)
        }, 200, cors);
      }

      let msgs = (Array.isArray(body.messages) ? body.messages : [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-12)
        .map(m => ({ role: m.role, content: m.content.slice(0, 500) }));
      if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: '(start the conversation)' });

      const text = await llm(env, chatPrompt(opts), msgs, 500);
      const o = parseJSON(text) || { reply: text.trim() };
      const sc = o.score == null || o.score === '' ? NaN : Number(o.score);
      return json({
        reply: clip(o.reply, 600),
        correction: strOrNull(o.correction, 400),
        corrected: strOrNull(o.corrected, 300),
        suggestion: strOrNull(o.suggestion, 300),
        translation: clip(o.translation, 600),
        score: Number.isFinite(sc) ? Math.max(0, Math.min(100, Math.round(sc))) : null
      }, 200, cors);
    } catch (e) {
      return json({ error: clip(e.message || 'erro', 120) }, 502, cors);
    }
  }
};
