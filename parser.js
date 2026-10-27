/* Быстрый ввод: разбирает строку вроде
   «Позвонить клиенту завтра в 15:00 !1 #работа» на название, срок, время,
   приоритет, проект и повтор. Работает локально, без интернета и без ИИ. */
(function (root) {
  'use strict';

  const W = String.raw`\p{L}\d`;
  // слово целиком (граница без lookbehind — он не везде поддерживается)
  const re = src => new RegExp(String.raw`(^|[^${W}])(${src})(?![${W}])`, 'iu');

  const WD = [
    String.raw`понедельник[а-яё]*`, String.raw`вторник[а-яё]*`, String.raw`сред[ауые]`,
    String.raw`четверг[а-яё]*`, String.raw`пятниц[аыуе]`, String.raw`суббот[аыуе]`, String.raw`воскресень[еяю]`
  ];
  const WD_ANY = '(?:' + WD.join('|') + ')';
  const WD_ABBR = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  const pad = n => String(n).padStart(2, '0');
  const fmt = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const toDate = s => new Date(s + 'T00:00');
  const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return fmt(d); };
  const dow = s => (toDate(s).getDay() + 6) % 7; // Пн = 0

  function nextWeekday(today, target, includeToday) {
    let diff = (target - dow(today) + 7) % 7;
    if (diff === 0 && !includeToday) diff = 7;
    return addDays(today, diff);
  }
  function weekdayIndex(word) {
    word = word.toLowerCase();
    for (let i = 0; i < WD.length; i++) if (new RegExp('^(?:' + WD[i] + ')$', 'iu').test(word)) return i;
    return WD_ABBR.indexOf(word);
  }
  function validYMD(y, m, d) {
    const x = new Date(y, m, d);
    return x.getFullYear() === y && x.getMonth() === m && x.getDate() === d;
  }

  // найти и вырезать фрагмент; validate может отклонить совпадение
  function grab(text, src, validate) {
    const r = re(src).exec(text);
    if (!r) return null;
    const g = r.slice(3);
    if (validate && !validate(g)) return null;
    const start = r.index + r[1].length, end = start + r[2].length;
    return { g, text: text.slice(0, start) + ' ' + text.slice(end) };
  }

  const PREP = String.raw`(?:(?:на|в|во|к|до|с|со)\s+)?`;

  function parse(input, opts) {
    opts = opts || {};
    const today = opts.today || fmt(new Date());
    const projects = opts.projects || [];
    const original = String(input || '').trim();
    let t = ' ' + original + ' ';
    const out = { title: '', date: '', time: '', prio: 3, repeat: '', projectName: '', projectId: null };
    let hit;

    // приоритет: !1 !2 !3
    if ((hit = grab(t, String.raw`!([1-3])`))) { out.prio = +hit.g[0]; t = hit.text; }

    // проект: #имя (подчёркивание = пробел)
    if ((hit = grab(t, String.raw`#([\p{L}\d_-]+)`))) {
      t = hit.text;
      const raw = hit.g[0].replace(/_/g, ' ');
      const low = raw.toLowerCase();
      let p = projects.find(x => x.name.toLowerCase() === low);
      if (!p) {
        const cand = projects.filter(x => x.name.toLowerCase().startsWith(low));
        if (cand.length === 1) p = cand[0];
      }
      if (p) { out.projectId = p.id; out.projectName = p.name; }
      else out.projectName = raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    // повтор
    let repeatWeekday = -1;
    if ((hit = grab(t, String.raw`(?:каждый\s+день|ежедневно)`))) { out.repeat = 'daily'; t = hit.text; }
    else if ((hit = grab(t, String.raw`(?:по\s+будням|каждый\s+будний\s+день)`))) { out.repeat = 'weekdays'; t = hit.text; }
    else if ((hit = grab(t, String.raw`(?:каждый\s+месяц|ежемесячно)`))) { out.repeat = 'monthly'; t = hit.text; }
    else if ((hit = grab(t, String.raw`(?:каждую\s+неделю|еженедельно)`))) { out.repeat = 'weekly'; t = hit.text; }
    else if ((hit = grab(t, String.raw`кажд(?:ый|ую|ое)\s+(${WD_ANY})`))) {
      out.repeat = 'weekly'; repeatWeekday = weekdayIndex(hit.g[0]); t = hit.text;
    }

    // время
    const okHM = (h, m) => h >= 0 && h <= 23 && m >= 0 && m <= 59;
    const setTime = (h, m) => { out.time = pad(h) + ':' + pad(m); };
    if ((hit = grab(t, String.raw`(?:(?:в|во|к|до)\s*)?(\d{1,2}):(\d{2})`, g => okHM(+g[0], +g[1])))) {
      setTime(+hit.g[0], +hit.g[1]); t = hit.text;
    } else if ((hit = grab(t, String.raw`(?:в|во)\s*(\d{1,2})\.(\d{2})`, g => okHM(+g[0], +g[1])))) {
      setTime(+hit.g[0], +hit.g[1]); t = hit.text;
    } else if ((hit = grab(t, String.raw`(?:в|во|к)\s*(\d{1,2})(?:\s*час(?:ов|а)?)?\s*(утра|вечера|дня|ночи)`, g => +g[0] >= 1 && +g[0] <= 12))) {
      let h = +hit.g[0]; const part = hit.g[1].toLowerCase();
      if (part === 'утра') h = h === 12 ? 0 : h;
      else if (part === 'дня') h = h === 12 ? 12 : h + 12;
      else if (part === 'вечера') h = h === 12 ? 12 : h + 12;
      else h = h === 12 ? 0 : (h >= 6 ? h + 12 : h); // ночи
      setTime(h % 24, 0); t = hit.text;
    } else if ((hit = grab(t, String.raw`(?:в|во|к)\s*(\d{1,2})\s*час(?:ов|а)?`, g => +g[0] >= 0 && +g[0] <= 23))) {
      setTime(+hit.g[0], 0); t = hit.text;
    }

    // дата
    if (repeatWeekday >= 0) {
      out.date = nextWeekday(today, repeatWeekday, true);
    } else if ((hit = grab(t, PREP + 'послезавтра'))) { out.date = addDays(today, 2); t = hit.text; }
    else if ((hit = grab(t, PREP + 'завтра'))) { out.date = addDays(today, 1); t = hit.text; }
    else if ((hit = grab(t, PREP + 'сегодня'))) { out.date = today; t = hit.text; }
    else if ((hit = grab(t, String.raw`через\s+(?:(\d+)\s*)?(день|дня|дней|неделю|недели|недель|месяц|месяца|месяцев)`))) {
      const n = hit.g[0] ? +hit.g[0] : 1, unit = hit.g[1].toLowerCase();
      if (unit.startsWith('д')) out.date = addDays(today, n);
      else if (unit.startsWith('н')) out.date = addDays(today, 7 * n);
      else { const d = toDate(today); d.setMonth(d.getMonth() + n); out.date = fmt(d); }
      t = hit.text;
    } else if ((hit = grab(t, PREP + String.raw`(\d{1,2})\s+(${MONTHS.join('|')})(?:\s+(\d{4}))?`,
               g => validYMD(g[2] ? +g[2] : 2000, MONTHS.indexOf(g[1].toLowerCase()), +g[0])))) {
      const day = +hit.g[0], mon = MONTHS.indexOf(hit.g[1].toLowerCase());
      let year = hit.g[2] ? +hit.g[2] : toDate(today).getFullYear();
      if (!hit.g[2] && fmt(new Date(year, mon, day)) < today) year++;
      if (validYMD(year, mon, day)) { out.date = fmt(new Date(year, mon, day)); t = hit.text; }
    } else if ((hit = grab(t, String.raw`(?:(?:на|в|к|до|с)\s+)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?`,
               g => validYMD(2000, +g[1] - 1, +g[0]))) ||
               (hit = grab(t, String.raw`(\d{1,2})[./](\d{1,2})[./](\d{2,4})`, g => validYMD(2000, +g[1] - 1, +g[0])))) {
      const day = +hit.g[0], mon = +hit.g[1] - 1;
      let year = hit.g[2] ? (+hit.g[2] < 100 ? 2000 + +hit.g[2] : +hit.g[2]) : toDate(today).getFullYear();
      if (!hit.g[2] && fmt(new Date(year, mon, day)) < today) year++;
      if (validYMD(year, mon, day)) { out.date = fmt(new Date(year, mon, day)); t = hit.text; }
    } else if ((hit = grab(t, PREP + '(' + WD_ANY + ')'))) {
      out.date = nextWeekday(today, weekdayIndex(hit.g[0]), false); t = hit.text;
    } else if ((hit = grab(t, String.raw`(?:в|во)\s+(пн|вт|ср|чт|пт|сб|вс)`))) {
      out.date = nextWeekday(today, weekdayIndex(hit.g[0]), false); t = hit.text;
    }

    // повтор без даты — начинаем с сегодняшнего дня
    if (out.repeat && !out.date) {
      out.date = out.repeat === 'weekdays' ? nextWeekday(today, dow(today) < 5 ? dow(today) : 0, true) : today;
      if (out.repeat === 'weekdays' && dow(today) >= 5) out.date = nextWeekday(today, 0, true);
    }
    // время без даты — сегодня
    if (out.time && !out.date) out.date = today;

    // название
    let title = t.replace(/\s+/g, ' ').trim()
      .replace(/^[\s,.;:–—-]+|[\s,.;:–—-]+$/g, '')
      .replace(/\s+(?:на|в|во|к|до|с|со)$/i, '')
      .trim();
    if (!title) title = original.replace(/\s+/g, ' ');
    out.title = title.charAt(0).toUpperCase() + title.slice(1);
    return out;
  }

  const api = { parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QuickParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
