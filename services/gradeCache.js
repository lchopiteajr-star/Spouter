const ACTIVITY_URL = (wallet) =>
  `https://data-api.polymarket.com/activity?user=${wallet}&limit=100`;

// Module-level cache — survives re-renders, cleared on app restart
const _cache = new Map();   // wallet -> gradeResult | null
const _pending = new Map(); // wallet -> Promise

export function computeGrade(trades) {
  const resolved = (trades ?? []).filter(
    (t) => t.cashPnl != null && t.cashPnl !== '' && !Number.isNaN(Number(t.cashPnl))
  );
  if (resolved.length === 0) return null;

  const totalPnl = resolved.reduce((sum, t) => sum + Number(t.cashPnl), 0);
  const wins = resolved.filter((t) => Number(t.cashPnl) > 0).length;
  const winRate = wins / resolved.length;
  const avgPnl = totalPnl / resolved.length;

  let letter;
  if (winRate > 0.65 && totalPnl > 0)       letter = 'A+';
  else if (winRate > 0.55 && totalPnl > 0)  letter = 'A';
  else if (winRate > 0.45 && totalPnl > 0)  letter = 'B';
  else if (winRate < 0.40 && totalPnl < 0)  letter = 'D';
  else                                        letter = 'C';

  return { letter, totalPnl, winRate, avgPnl, resolvedCount: resolved.length };
}

export function getGrade(wallet) {
  return _cache.has(wallet) ? _cache.get(wallet) : undefined; // undefined = not fetched yet
}

export function fetchGrade(wallet) {
  if (!wallet) return Promise.resolve(null);
  if (_cache.has(wallet)) return Promise.resolve(_cache.get(wallet));
  if (_pending.has(wallet)) return _pending.get(wallet);

  const promise = fetch(ACTIVITY_URL(wallet))
    .then((r) => (r.ok ? r.json() : []))
    .then((data) => {
      const grade = computeGrade(Array.isArray(data) ? data : []);
      _cache.set(wallet, grade); // cache null too so we don't retry
      _pending.delete(wallet);
      return grade;
    })
    .catch(() => {
      _cache.set(wallet, null);
      _pending.delete(wallet);
      return null;
    });

  _pending.set(wallet, promise);
  return promise;
}
