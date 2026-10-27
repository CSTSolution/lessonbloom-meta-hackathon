// Every setting the server reads, in one place. Secrets come from the environment only.
const env = (k: string, d = '') => process.env[k] ?? d;
const num = (k: string, d: number) => (Number.isFinite(Number(process.env[k])) && process.env[k] !== '' && process.env[k] !== undefined ? Number(process.env[k]) : d);

export const config = {
  port: num('PORT', 8080),
  dataDir: env('LB_DATA_DIR', 'data'),
  databaseUrl: env('DATABASE_URL'),
  publicUrl: env('LB_PUBLIC_URL', 'https://lessonbloom-meta.cstsolution.com'),
  adminKey: env('LB_ADMIN_KEY'),

  meta: {
    key: env('MODEL_API_KEY'),
    base: env('LB_META_BASE', 'https://api.meta.ai/v1'),
    text: env('LB_META_TEXT', 'muse-spark-1.3'),
    textFallbacks: env('LB_META_TEXT_FALLBACKS', 'muse-spark-1.2').split(',').map((s) => s.trim()).filter(Boolean),
    agent: env('LB_META_AGENT', 'muse-wonder-1.0'),
    image: env('LB_META_IMAGE', 'muse-image-1.0'),
    sam: env('LB_META_SAM', 'sam-3.1'),
    transcribe: env('LB_META_TRANSCRIBE', 'muse-voice-transcribe-1.0'),
  },
  voices: { vieneu: env('VIENEU_URL'), kokoro: env('KOKORO_URL') },

  mail: {
    host: env('SMTP_SERVER'), port: num('SMTP_PORT', 587), user: env('SMTP_USER'), key: env('SMTP_KEY'),
    from: env('MAIL_FROM', 'no-reply@cstsolution.com'), fromName: env('LB_MAIL_FROM_NAME', 'LessonBloom'),
  },

  // guard layer 1: limits and money
  guard: {
    disabled: env('AI_DISABLED') === '1',
    dayUsd: num('LB_DAY_USD', 20),               // the whole app, per day (Meta credit: $150 in all)
    teacherDayUsd: num('LB_TEACHER_DAY_USD', 2),  // one teacher, per day
    demoPerIpDay: num('LB_DEMO_PER_IP_DAY', 6),
    codesPerEmailDay: 5, codesPerIpDay: 20, codeGapSeconds: 60,
    lessonsDemoDay: num('LB_LESSONS_DEMO_DAY', 3), lessonsDay: num('LB_LESSONS_DAY', 10),
  },
  session: { days: 30, demoDays: 7 },
};
