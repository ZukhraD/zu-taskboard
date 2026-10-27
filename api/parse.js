// Vercel serverless: разбор текста в задачи через Gemini.
// Ключ хранится только в переменной окружения GEMINI_API_KEY (Vercel → Settings → Environment Variables).
const SB_URL = 'https://enxmmjdmkbfpmbyvgyei.supabase.co';
const SB_KEY = 'sb_publishable_8ODpS1wNyP_aSewFC2VmIQ_DqXGOLv4';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'no_key' });

  // только для вошедших пользователей
  const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
  if (!token) return res.status(401).json({ error: 'auth' });
  try {
    const u = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token } });
    if (!u.ok) return res.status(401).json({ error: 'auth' });
  } catch (e) { return res.status(502).json({ error: 'auth_unreachable' }); }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const text = String(body.text || '').slice(0, 4000);
  const today = String(body.today || '').slice(0, 10);
  const projects = (body.projects || []).slice(0, 50).map(String);
  if (!text.trim()) return res.status(400).json({ error: 'empty' });

  const prompt = `Сегодня ${today}. Из сообщения выдели задачи. Верни JSON-массив объектов
{"title": строка, "date": "YYYY-MM-DD" или "", "time": "HH:MM" или "", "prio": 1|2|3 (1 высокий, по умолчанию 3), "project": название из списка [${projects.join(', ')}] или ""}.
Не выдумывай то, чего нет в тексте. Сообщение:\n"""${text}"""`;

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
      })
    });
    if (!r.ok) return res.status(502).json({ error: 'gemini_' + r.status });
    const j = await r.json();
    const raw = j.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    let tasks = JSON.parse(raw);
    if (!Array.isArray(tasks)) tasks = [tasks];
    tasks = tasks.slice(0, 20).map(t => ({
      title: String(t.title || '').slice(0, 200),
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : '',
      time: /^\d{2}:\d{2}$/.test(t.time) ? t.time : '',
      prio: [1, 2, 3].includes(+t.prio) ? +t.prio : 3,
      project: String(t.project || '')
    })).filter(t => t.title);
    res.status(200).json({ tasks });
  } catch (e) { res.status(502).json({ error: 'parse_failed' }); }
};
