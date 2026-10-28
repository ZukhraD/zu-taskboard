// Тестовое уведомление себе: кнопка «Проверить» в настройках.
const { rest, userFromToken, sendPush, bearer, svcKey } = require('../lib/server');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!svcKey() || !process.env.VAPID_PRIVATE_KEY) return res.status(503).json({ error: 'not_configured' });
  const user = await userFromToken(bearer(req)).catch(() => null);
  if (!user || !user.id) return res.status(401).json({ error: 'auth' });
  try {
    const subs = await rest(`push_subs?user_id=eq.${encodeURIComponent(user.id)}&select=endpoint,sub`);
    if (!subs || !subs.length) return res.status(404).json({ error: 'no_subscription' });
    const results = [];
    for (const s of subs) {
      const r = await sendPush(s.sub, { title: 'Задачи', body: 'Тест: уведомления работают', tag: 'test', url: './' });
      if (r === 'gone') await rest(`push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' }).catch(() => {});
      results.push(r);
    }
    res.status(200).json({ results });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
};
