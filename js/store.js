(function () {
  'use strict';
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    remove(k) { try { localStorage.removeItem(k); } catch (e) { /* ok */ } }
  };
  const ext = window.NEXA_STORAGE;
  const ok = ext && typeof ext.get === 'function' && typeof ext.set === 'function';
  const A = ok ? ext : ls;
  window.NexaStore = Object.freeze({
    get: (k) => { try { const v = A.get(k); return v == null ? null : String(v); } catch (e) { return null; } },
    set: (k, v) => { try { return A.set(k, String(v)) !== false; } catch (e) { return false; } },
    remove: (k) => { try { (A.remove || ((x) => A.set(x, '')))(k); } catch (e) { /* ok */ } },
    transaction: (fn) => (ok && typeof A.transaction === 'function' ? A.transaction(fn) : fn({ get: A.get.bind(A), set: A.set.bind(A) })),
    kind: ok ? 'external' : 'localStorage'
  });
}());
