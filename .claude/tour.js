// Осмотр миссии: __tour(id) запускает миссию, входит, пропускает вступление и замораживает бой; __look(x,z,yawDeg,pitchDeg) ставит камеру.
(() => {
  window.__errs = window.__errs || [];
  window.addEventListener('error', (e) => __errs.push(String(e.message)));
  window.__tour = async (id) => {
    if (window.__r && !window.__r.disposed) { try { window.__r.finish(false); } catch (e) {} await new Promise((r) => setTimeout(r, 300)); }
    const t0 = performance.now();
    const r = window.__r = Missions.start(id, { audio: { masterVolume: 0, musicVolume: 0, sfxVolume: 0, musicEnabled: false, sfxEnabled: false }, playSfx() {}, onComplete() {}, onExit() {}, onStage() {}, onCutscene() {} });
    if (!r) return 'refused';
    for (let i = 0; i < 300; i += 1) { await new Promise((res) => setTimeout(res, 100)); const b = document.querySelector('.m-enter'); if (b && !b.hidden) break; }
    const ms = Math.round(performance.now() - t0);
    document.querySelector('.m-enter').click();
    await new Promise((res) => setTimeout(res, 800));
    for (let i = 0; i < 40 && (i < 3 || r.inCinema); i += 1) { document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); await new Promise((res) => setTimeout(res, 300)); }
    r.hurt = () => {};
    return { ms, theme: r.propTheme, props: r.propN, errs: __errs.slice(-3) };
  };
  window.__look = async (x, z, yawDeg, pitchDeg, wait) => {
    const r = window.__r; r.p.x = x; r.p.z = z; r.p.yaw = (yawDeg || 0) * Math.PI / 180; r.p.pitch = (pitchDeg || 0) * Math.PI / 180;
    if (r.hp !== undefined) r.hp = r.maxHp || 100;
    await new Promise((res) => setTimeout(res, wait || 400)); return [r.p.x, r.p.z];
  };
})();
