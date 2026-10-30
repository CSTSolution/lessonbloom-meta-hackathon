// Set at build time (web/vite.config.ts): v1.0.<date>.<time, Hanoi>.
declare const __APP_VERSION__: string;
export const VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
