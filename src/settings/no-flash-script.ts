import { SETTINGS_KEY } from './storage';

/**
 * Runs in <head> before the first paint, so the page never flashes the wrong
 * theme. It only sets the two attributes on <html>; SettingsProvider takes over
 * after hydration. Wrapped in try/catch: storage may be blocked.
 */
export const NO_FLASH_SCRIPT = `(function(){try{var r=document.documentElement,s=null;try{s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||'null')}catch(e){}if(!s||typeof s!=='object')s={};var t=s.theme==='light'?'light':'dark';var m=typeof s.reducedMotion==='boolean'?s.reducedMotion:!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);r.dataset.theme=t;r.dataset.reducedMotion=String(m)}catch(e){}})();`;
