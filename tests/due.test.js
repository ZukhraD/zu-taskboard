const assert = require('assert');
const { zonedToUtc, plan } = require('../lib/due');
const TZ = 'Asia/Almaty'; // UTC+5
let n = 0; const ok = (name, f) => { f(); n++; console.log('ok  ', name); };

ok('перевод местного времени в UTC (Алматы +5)', () => {
  assert.strictEqual(new Date(zonedToUtc('2026-10-28', '18:00', TZ)).toISOString(), '2026-10-28T13:00:00.000Z');
});
ok('летнее время (Нью-Йорк, лето UTC-4 / зима UTC-5)', () => {
  assert.strictEqual(new Date(zonedToUtc('2026-07-01', '09:00', 'America/New_York')).toISOString(), '2026-07-01T13:00:00.000Z');
  assert.strictEqual(new Date(zonedToUtc('2026-12-01', '09:00', 'America/New_York')).toISOString(), '2026-12-01T14:00:00.000Z');
});

const due = zonedToUtc('2026-10-28', '18:00', TZ);
const state = { tasks: [
  { id: 'a', title: 'Позвонить маме', date: '2026-10-28', time: '18:00', done: false, prio: 3 },
  { id: 'b', title: 'Без времени', date: '2026-10-28', time: '', done: false, prio: 3 },
  { id: 'c', title: 'Сделано', date: '2026-10-28', time: '18:00', done: true, prio: 3 },
  { id: 'd', title: 'Вчера', date: '2026-10-27', time: '', done: false, prio: 1 }
] };
const sub = { lead_min: 0, digest: '', tz: TZ };
const keys = (arr) => arr.map(x => x.key);

ok('до срока ничего не шлём', () => assert.deepStrictEqual(plan(state, sub, due - 60000, new Set()), []));
ok('в срок шлём, только невыполненные и со временем', () => {
  const r = plan(state, sub, due + 1000, new Set());
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].title, 'Позвонить маме'); assert.strictEqual(r[0].body, 'Сейчас, 18:00');
});
ok('повторно не шлём (дедупликация)', () => {
  const first = plan(state, sub, due + 1000, new Set());
  assert.deepStrictEqual(plan(state, sub, due + 61000, new Set(keys(first))), []);
});
ok('опоздание до 15 минут ещё шлём, позже нет', () => {
  assert.strictEqual(plan(state, sub, due + 14 * 60000, new Set()).length, 1);
  assert.strictEqual(plan(state, sub, due + 16 * 60000, new Set()).length, 0);
});
ok('за 10 минут', () => {
  const s = { ...sub, lead_min: 10 };
  assert.strictEqual(plan(state, s, due - 11 * 60000, new Set()).length, 0);
  const r = plan(state, s, due - 9 * 60000, new Set());
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].body, 'Через 10 мин, в 18:00');
});
ok('перенос срока даёт новое уведомление', () => {
  const k = keys(plan(state, sub, due + 1000, new Set()));
  const moved = { tasks: [{ ...state.tasks[0], time: '19:00' }] };
  assert.strictEqual(plan(moved, sub, zonedToUtc('2026-10-28', '19:00', TZ) + 1000, new Set(k)).length, 1);
});
ok('утренняя сводка: после 09:00, один раз в день', () => {
  const s = { ...sub, digest: '09:00' };
  const t8 = zonedToUtc('2026-10-28', '08:30', TZ), t9 = zonedToUtc('2026-10-28', '09:05', TZ);
  assert.strictEqual(plan(state, s, t8, new Set()).filter(x => x.tag === 'digest').length, 0);
  const d = plan(state, s, t9, new Set()).filter(x => x.tag === 'digest');
  assert.strictEqual(d.length, 1);
  assert.ok(d[0].body.includes('Задач: 3') && d[0].body.includes('просрочено: 1'), d[0].body);
  assert.strictEqual(plan(state, s, t9 + 600000, new Set(['d|2026-10-28'])).filter(x => x.tag === 'digest').length, 0);
});
ok('сводка без задач не шлёт уведомление', () => {
  const s = { ...sub, digest: '09:00' };
  const r = plan({ tasks: [] }, s, zonedToUtc('2026-10-28', '09:05', TZ), new Set());
  assert.ok(r.every(x => x.silent));
});
ok('неизвестный часовой пояс не ломает работу', () => {
  assert.doesNotThrow(() => plan(state, { ...sub, tz: 'Mars/Base' }, due, new Set()));
});
console.log('ВСЕ ТЕСТЫ ПРОШЛИ:', n);
