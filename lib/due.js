// Чистая логика: какие уведомления пора отправить. Без сети и без зависимостей.
function tzParts(ts, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o = {};
  for (const p of f.formatToParts(new Date(ts))) o[p.type] = p.value;
  return o;
}
function offsetMs(ts, tz) {
  const o = tzParts(ts, tz);
  const asUtc = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}
// «2026-10-28» + «18:00» в часовом поясе tz -> момент в UTC (мс)
function zonedToUtc(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetMs(guess, tz);
  t = guess - offsetMs(t, tz);
  return t;
}
function localNow(ts, tz) {
  const o = tzParts(ts, tz);
  return { date: `${o.year}-${o.month}-${o.day}`, minutes: (+o.hour % 24) * 60 + +o.minute };
}
const validTz = tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; } };

const GRACE_MS = 15 * 60 * 1000;      // опоздавшее напоминание ещё полезно ~15 минут
const DIGEST_WINDOW_MIN = 120;

/* state — данные пользователя; sub — {lead_min, digest, tz}; sent — Set уже отправленных ключей */
function plan(state, sub, now, sent) {
  const tz = validTz(sub.tz) ? sub.tz : 'UTC';
  const lead = Math.max(0, +sub.lead_min || 0);
  const out = [];
  const tasks = (state && state.tasks) || [];

  for (const t of tasks) {
    if (t.done || !t.date || !/^\d{2}:\d{2}$/.test(t.time || '')) continue;
    const due = zonedToUtc(t.date, t.time, tz);
    const fireAt = due - lead * 60000;
    if (now < fireAt || now >= due + GRACE_MS) continue;
    const key = `t|${t.id}|${t.date}|${t.time}|${lead}`;
    if (sent.has(key)) continue;
    out.push({
      key, tag: 't' + t.id,
      title: t.title,
      body: lead ? `Через ${lead} мин, в ${t.time}` : `Сейчас, ${t.time}`
    });
  }

  const m = /^(\d{2}):(\d{2})$/.exec(sub.digest || '');
  if (m) {
    const ln = localNow(now, tz);
    const dm = +m[1] * 60 + +m[2];
    const key = `d|${ln.date}`;
    if (ln.minutes >= dm && ln.minutes < dm + DIGEST_WINDOW_MIN && !sent.has(key)) {
      const open = tasks.filter(t => !t.done && t.date && t.date <= ln.date);
      const late = open.filter(t => t.date < ln.date).length;
      if (open.length) {
        const top = open.sort((a, b) => (a.prio || 3) - (b.prio || 3)).slice(0, 3).map(t => '• ' + t.title).join('\n');
        out.push({
          key, tag: 'digest',
          title: 'План на сегодня',
          body: `Задач: ${open.length}` + (late ? `, просрочено: ${late}` : '') + '\n' + top
        });
      } else {
        out.push({ key, tag: 'digest', title: '', body: '', silent: true }); // отметить, чтобы не проверять снова
      }
    }
  }
  return out;
}

module.exports = { zonedToUtc, localNow, plan, validTz };
