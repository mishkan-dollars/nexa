// dev-only: конфигурация моделей. Размеры — в метрах: h (высота), len (большая сторона в плане), w, d, max.
// rot — поворот до масштабирования (градусы), pivot: bottom | center | top, tris — целевое число треугольников, tex — макс. сторона текстуры,
// sat — насыщенность (0 = чёрно-белое; по умолчанию 0.25), bri — яркость, texFile — файл baseColor из распакованного zip (относительно work/x).
'use strict';
const T = (z, f) => z + '/textures/' + f;
module.exports = {
  // ---------------------------------------------------------------- офис
  office_desk: { src: 'office-desk---6mb.glb', rot: [-90, 0, 0], len: 1.9, tris: 1800, tex: 256, texFile: T('office-desk---6mb', 'Office_desk_BaseColor.png') },
  office_chair: { src: 'office-chair.glb', h: 0.95, tris: 2200, tex: 128, sat: 0.2 },
  cubicle: { src: 'cubicle_v2.glb', len: 2.0, tris: 3500, tex: 128, err: 0.03 },
  filing_cabinet: { src: 'filing-cabinet.glb', rot: [-90, 0, 0], h: 1.3, tris: 800, tex: 128, texFile: T('filing-cabinet', 'FilingCabinet1.png') },
  computer_tower: { src: 'computer_tower.glb', h: 0.5, tris: 800, sat: 0.1 },
  crt_monitor: { src: 'crt-monitor.glb', h: 0.38, tris: 1100, tex: 256, texFile: T('crt-monitor', 'computer_Material_BaseColor.png') },
  copier: { src: 'printer_copy_machine_and_scanner_in_one.glb', len: 0.8, tris: 2500, tex: 128 },
  water_cooler: { src: 'water_cooler.glb', h: 1.1, tris: 808, tex: 128 },
  ceiling_lamp: { src: 'ceiling_lamp-10mb.glb', len: 1.2, tris: 1000, tex: 128, pivot: 'top', sat: 0 },
  server_rack: { src: 'server_rack.glb', h: 1.9, tris: 744, tex: 256 },
  // ---------------------------------------------------------------- лаборатория
  lab_table: { src: 'laboratory_table_with_tray.glb', len: 2.0, tris: 4500, tex: 128, err: 0.06 },
  centrifuge: { src: 'centrifuge.glb', h: 0.5, tris: 1500, tex: 256 },
  cryo_chamber: { src: 'cryo_chamber.glb', h: 2.0, tris: 3000, tex: 256 },
  specimen_jar: { src: 'creature_specimen_jar.glb', h: 0.5, tris: 2000, tex: 256, err: 0.05 },
  gas_cylinder: { src: 'gas-cylinder-10mb.glb', h: 1.3, tris: 1500, tex: 256, texFile: T('gas-cylinder-10mb', 'Untitled_2_DefaultMaterial_BaseColor.png') },
  biohazard_barrel: { src: 'biohazard_barrel_v1.0.glb', h: 0.95, tris: 1500, tex: 256 },
  hazmat_suit: { src: 'hazmat-suit.glb', h: 1.8, tris: 5000, tex: 128, err: 0.05 },
  // ---------------------------------------------------------------- бункер / промзона
  generator: { src: 'generator.glb', len: 1.4, tris: 3000, tex: 256 },
  industrial_lamp: { src: 'industrial_lamp.glb', h: 0.55, tris: 1500, tex: 128, pivot: 'top' },
  duct: { src: 'air_ventilation_duct.glb', len: 2.0, tris: 250, tex: 128 },
  sandbag: { src: 'sandbag.glb', len: 0.7, tris: 900, tex: 256 },
  ammo_crate: { src: 'sci-fi_ammo_box.glb', h: 0.55, tris: 2200, tex: 256 },
  catwalk: { src: 'low-poly-catwalk.glb', len: 3.0, tris: 3000, tex: 256, texFile: T('low-poly-catwalk', 'Metal046A_2K_Color.jpeg') },
  scrap_pile: { src: 'scrap_metal_pile.glb', len: 3.0, tris: 700, tex: 256 },
  barrel: { src: 'barrel.glb', h: 0.95, tris: 1500, tex: 256 },
  barrel_red: { src: 'explosive-barrel.glb', h: 0.95, tris: 720, tex: 256, texFile: T('explosive-barrel', 'Barrel_Base_Color.png'), sat: 0.45 },
  fire_alarm: { src: 'fire_alarm_horn_and_light.glb', h: 0.22, tris: 900, tex: 128, sat: 0.5, err: 0.25 },
  camera: { src: 'security-camera.glb', len: 0.45, tris: 1500, tex: 128 },
  // ---------------------------------------------------------------- особняк
  armchair: { src: 'armchair.glb', h: 0.85, tris: 2200, tex: 256 },
  sofa: { src: 'sofa.glb', len: 1.9, tris: 2500, tex: 256 },
  bookshelf: { src: 'bookshelf.glb', h: 2.0, tris: 1000, tex: 256 },
  chandelier: { src: 'victorian_chandelier.glb', h: 0.8, tris: 3500, tex: 128, pivot: 'top', err: 0.03, err: 0.35 },
  // ---------------------------------------------------------------- добыча
  gold_bar: { src: 'gold-bar.glb', len: 0.28, tris: 600, sat: 0.55, tint: [1.3, 1.1, 0.7] },
  dollars: { src: 'stack-of-dollars.glb', len: 0.22, tris: 400, tex: 128, texFile: T('stack-of-dollars', 'front.jpeg') },
  duffel: { src: 'keystone-rolling-duffel-bag.glb', len: 0.75, tris: 2200, sat: 0, tint: [0.35, 0.35, 0.35] },
  // ---------------------------------------------------------------- гаджеты и предметы
  c4: { src: 'c4-explosive.glb', len: 0.3, tris: 900, tex: 256, bri: 2.6, texFile: T('c4-explosive', 'materials_models_weapons_w_models_w_c4_c4_.png'), pivot: 'bottom' },
  frag: { src: 'm69_frag_grenade.glb', h: 0.16, tris: 900, tex: 256, sat: 0, bri: 1.6 },
  flashbang: { src: 'flashbang_grenade.glb', h: 0.2, tris: 700, tex: 256 },
  smoke: { src: 'sci-fi-smoke-grenade.glb', len: 0.24, tris: 800, tex: 256, texFile: T('sci-fi-smoke-grenade', 'DefaultMaterial_Base_Color.png') },
  medkit: { src: 'medkit.glb', len: 0.34, tris: 900, tex: 256, texFile: T('medkit', 'Medkit_Base_Color.png'), sat: 0.5 },
  keycard: { src: 'keycard.glb', len: 0.22, tris: 76, tex: 128, texFile: T('keycard', 'Card_Diff.png'), sat: 0.4 },
  usb: { src: 'usb_flash_drive.glb', h: 0.22, tris: 1200, tex: 256 },
  hard_drive: { src: 'hard_drive-sf.glb', len: 0.32, tris: 1500, tex: 256, err: 0.3 },
  lockpick: { src: 'lockpick.glb', len: 0.22, tris: 300, rot: [90, 0, 0] },
  hack_terminal: { src: 'portable_hacking_terminal_made_of_aluminum.glb', len: 0.75, tris: 14000, tex: 512, err: 0.02 },
  fingerprint: { src: 'biometric-fingerprint-scanner.glb', len: 0.45, tris: 310, tex: 128, sat: 0.4 }
};
