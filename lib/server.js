// Общие помощники для серверных функций: Supabase REST (служебный ключ) и web-push.
const SB_URL = 'https://enxmmjdmkbfpmbyvgyei.supabase.co';
const SB_PUBLISHABLE = 'sb_publishable_8ODpS1wNyP_aSewFC2VmIQ_DqXGOLv4';
const VAPID_PUBLIC = 'BKzbNEL5Jt40EOTRrGUWS3nLPybpHYtNHVWSba7j3z6vkqwVGSn86EQh5jT_SMUCztDuBBNMzdIOluonJ081eAs';

function svcKey() { return process.env.SUPABASE_SERVICE_KEY || ''; }

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const k = svcKey();
  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    method,
    headers: {
      apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`supabase ${method} ${path.split('?')[0]} ${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

async function userFromToken(token) {
  if (!token) return null;
  const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SB_PUBLISHABLE, Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  return r.json();
}

let wp = null;
function webpush() {
  if (wp) return wp;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) throw new Error('no_vapid');
  wp = require('web-push');
  wp.setVapidDetails(process.env.VAPID_SUBJECT || 'https://zu-taskboard.vercel.app', VAPID_PUBLIC, priv);
  return wp;
}

// отправка одному устройству; вернёт 'ok' | 'gone' | 'error:<код>'
async function sendPush(sub, payload) {
  try {
    await webpush().sendNotification(sub, JSON.stringify(payload), { TTL: 900, urgency: 'high' });
    return 'ok';
  } catch (e) {
    if (e && (e.statusCode === 404 || e.statusCode === 410)) return 'gone';
    return 'error:' + ((e && e.statusCode) || (e && e.message) || 'unknown');
  }
}

const bearer = req => (req.headers.authorization || '').replace(/^Bearer /i, '');

module.exports = { rest, userFromToken, sendPush, bearer, svcKey };
