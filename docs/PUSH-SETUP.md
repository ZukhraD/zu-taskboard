# Настройка push-уведомлений

1. Supabase → SQL Editor: выполнить `supabase-push.sql` (один запрос).
2. Vercel → Settings → Environment Variables (для Production), затем Redeploy:
   - `SUPABASE_SERVICE_KEY` — Supabase → Project Settings → API Keys → secret key (service_role). Никому не показывать.
   - `VAPID_PRIVATE_KEY` — приватный ключ уведомлений.
   - `CRON_SECRET` — любая длинная случайная строка.
3. cron-job.org: задание раз в минуту на `https://zu-taskboard.vercel.app/api/cron`, заголовок `Authorization: Bearer <CRON_SECRET>`.
4. В приложении (с экрана «Домой» на iPhone): Настройки → Уведомления → Включить → Проверить.

Серверная логика: `lib/due.js` (что и когда отправлять, покрыта тестами `tests/due.test.js`), `api/cron.js`, `api/test.js`.
