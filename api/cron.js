// Вызывается раз в минуту внешним планировщиком (cron-job.org).
// Защита: заголовок Authorization: Bearer <CRON_SECRET> (или ?key=).
const crypto = require('crypto');
const { rest, sendPush, bearer, svcKey } = require('../lib/server');
const { plan } = require('../lib/due');

const enc = encodeURIComponent;
const short = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || !svcKey() || !process.env.VAPID_PRIVATE_KEY) return res.status(503).json({ error: 'not_configured' });
  const given = bearer(req) || (req.query && req.query.key) || '';
  const a = Buffer.from(String(given)), b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'auth' });

  const now = Date.now();
  const stats = { users: 0, sent: 0, gone: 0, errors: [] };
  try {
    const subs = await rest('push_subs?select=endpoint,user_id,sub,lead_min,digest,tz');
    const byUser = {};
    (subs || []).forEach(s => (byUser[s.user_id] = byUser[s.user_id] || []).push(s));
    const since = new Date(now - 3 * 864e5).toISOString();

    await Promise.all(Object.entries(byUser).map(async ([uid, list]) => {
      try {
        stats.users++;
        const rows = await rest(`app_state?user_id=eq.${enc(uid)}&select=data`);
        const state = rows && rows[0] && rows[0].data;
        if (!state) return;
        const logs = await rest(`push_log?user_id=eq.${enc(uid)}&at=gte.${enc(since)}&select=key`);
        const sentAll = new Set((logs || []).map(l => l.key));
        for (const s of list) {
          const sid = short(s.endpoint);
          const mine = new Set([...sentAll].filter(k => k.startsWith(sid + '|')).map(k => k.slice(sid.length + 1)));
          for (const n of plan(state, s, now, mine)) {
            const logKey = sid + '|' + n.key;
            if (!n.silent) {
              const r = await sendPush(s.sub, { title: n.title, body: n.body, tag: n.tag, url: './' });
              if (r === 'gone') { await rest(`push_subs?endpoint=eq.${enc(s.endpoint)}`, { method: 'DELETE' }); stats.gone++; break; }
              if (r !== 'ok') { stats.errors.push(r); continue; }
              stats.sent++;
            }
            await rest('push_log?on_conflict=user_id,key', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: { user_id: uid, key: logKey } });
          }
        }
      } catch (e) { stats.errors.push(String(e.message || e)); }
    }));
    await rest(`push_log?at=lt.${enc(new Date(now - 4 * 864e5).toISOString())}`, { method: 'DELETE' });
  } catch (e) { stats.errors.push(String(e.message || e)); return res.status(500).json(stats); }
  res.status(200).json(stats);
};
