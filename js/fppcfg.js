// NEXA: настройки «ПК и пространственного звука» (веб-камера, окклюзия звука, рабочий стол). Файл assets/fpp-config.json
// подмешивается поверх значений по умолчанию (ниже); не загрузился (file://, офлайн) — работают значения по умолчанию.
// Первые 12 ключей — как в ТЗ; browser_home_url / browser_search_url — адреса для встроенного браузера (Google отдаёт страницы с igu=1 во фрейм);
// последние 5 — дополнительные (частота кадров «сенсора» камеры, дальность рендера камеры,
// множитель опорной дальности для громких звуков — выстрелов и взрывов, окклюзия, число HRTF-голосов).
(function () {
  'use strict';
  const DEF = {
    webcam_fov: 75,
    render_target_resolution_x: 1280,
    render_target_resolution_y: 720,
    webcam_fps_limit: 60,
    recording_overlay_enabled: true,
    audio_ref_distance: 1.0,
    audio_max_distance: 25.0,
    audio_rolloff_factor: 1.5,
    audio_inner_cone_angle: 180,
    computer_interaction_key: 'E',
    desktop_theme_id: 'dark_nexus',
    search_engine_default_url: 'https://google.com',
    browser_home_url: 'https://www.google.com/webhp?igu=1',
    browser_search_url: 'https://www.google.com/search?igu=1&q={q}',
    webcam_feed_fps: 24,
    webcam_render_distance: 16,
    audio_loud_ref_scale: 8,
    audio_occlusion: true,
    audio_hrtf_voices: 8
  };
  const LIM = { webcam_fov: [20, 120], render_target_resolution_x: [64, 4096], render_target_resolution_y: [64, 4096], webcam_fps_limit: [1, 144], audio_ref_distance: [0.1, 100],
    audio_max_distance: [1, 500], audio_rolloff_factor: [0, 10], audio_inner_cone_angle: [0, 360], webcam_feed_fps: [1, 60], webcam_render_distance: [2, 80], audio_loud_ref_scale: [1, 50], audio_hrtf_voices: [0, 32] };
  const F = window.FPP = { DEF, cfg: Object.assign({}, DEF), ready: null };
  function merge(j) {
    if (!j || typeof j !== 'object') return;
    Object.keys(DEF).forEach((k) => {
      const v = j[k];
      if (typeof v !== typeof DEF[k] || (typeof v === 'number' && !isFinite(v))) return;
      F.cfg[k] = typeof v === 'number' && LIM[k] ? Math.max(LIM[k][0], Math.min(LIM[k][1], v)) : v;
    });
  }
  F.merge = merge;
  F.load = function () {
    if (F.ready) return F.ready;
    if (typeof fetch !== 'function' || location.protocol === 'file:') return (F.ready = Promise.resolve(F.cfg));
    F.ready = fetch('assets/fpp-config.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => { merge(j); return F.cfg; }).catch(() => F.cfg);
    return F.ready;
  };
  // клавиша взаимодействия с ПК → event.code ('E' → 'KeyE', '5' → 'Digit5', 'Enter' → 'Enter')
  F.keyCode = function () {
    const k = String(F.cfg.computer_interaction_key || 'E');
    if (/^[a-z]$/i.test(k)) return 'Key' + k.toUpperCase();
    if (/^[0-9]$/.test(k)) return 'Digit' + k;
    return k;
  };
  F.load();
}());
