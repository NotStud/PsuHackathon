const $ = (id) => document.getElementById(id);
let gameId = null;
let busy = false;
let refreshing = false;
async function api(path, method = 'GET') {
  const response = await fetch(path, { method });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not save changes. Please try again.');
  }
  return response.json();
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const [games, registered] = await Promise.all([api('/games'), api('/players')]);
    if (!games.some(g => g.id === gameId)) gameId = games[0]?.id ?? null;
    $('game').replaceChildren(...games.map(g => new Option(`Game #${g.id} · ${g.status}`, g.id)));
    $('game').value = gameId ?? '';
    const state = gameId ? await api(`/games/${gameId}/state`) : null;
    const players = (state?.players ?? []).sort((a,b) => b.score - a.score || a.player_id - b.player_id);
    $('summary').textContent = `${players.length} players · ${players.reduce((sum,p) => sum + p.score, 0)} total points`;
    const names = new Map(registered.map(p => [p.id, p.display_name]));
    const rows = players.map((p, index) => {
      const name = names.get(p.player_id) ?? `Player #${p.player_id}`;
      const row = element('div', 'player');
      row.append(element('span','rank',String(index+1).padStart(2,'0')), element('span','avatar',name.charAt(0).toUpperCase()), element('span','player-name',name),element('span','score',String(p.score)));
      const actions = element('div','actions');
      const reset = element('button','quiet','Reset');
      reset.setAttribute('aria-label',`Reset ${name}'s score`);
      reset.onclick = () => mutate(() => api(`/games/${gameId}/players/${p.player_id}/reset`, 'POST'));
      const point = element('button','point','+1');
      point.setAttribute('aria-label',`Add one point to ${name}`);
      point.onclick = () => mutate(() => api(`/games/${gameId}/players/${p.player_id}/increment`, 'POST'));
      actions.append(reset,point); row.append(actions); return row;
    });
    if (!rows.length) {
      const empty = element('div','empty');
      empty.append(element('strong','',gameId ? 'The board is yours.' : 'Ready for a new game?'),element('p','',gameId ? 'Add your first player to get started.' : 'Create a game, then bring in your players.'));
      rows.push(empty);
    }
    $('players').replaceChildren(...rows);
    const available = registered.filter(p => !players.some(gp => gp.player_id === p.id));
    $('registered').replaceChildren(...available.map(p => new Option(p.display_name,p.id)));
    $('registered-wrap').hidden = !gameId || !available.length || state?.game.status !== 'waiting';
    $('name').disabled = !gameId || state?.game.status !== 'waiting';
    $('add-player').querySelector('button').disabled = $('name').disabled;
    $('reset-all').disabled = !players.length;
    $('connection').textContent = '● Connected · updates every 2s';
    if (busy) document.querySelectorAll('button').forEach(b => b.disabled = true);
  } finally { refreshing = false; }
}
function showError(error) { $('error').textContent = error.message; $('error').hidden = false; $('connection').textContent = 'Connection or action failed'; }
async function mutate(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  $('error').hidden = true;
  try { await action(); } catch(error) { showError(error); }
  finally {
    busy = false;
    document.querySelectorAll('button').forEach(b => b.disabled = false);
    await refresh().catch(showError);
  }
}
$('new-game').onclick = () => mutate(async () => { const game = await api('/games','POST'); gameId = game.id; });
$('game').onchange = () => { gameId = Number($('game').value); refresh().catch(showError); };
$('add-player').onsubmit = (event) => {
  event.preventDefault();
  const name = $('name').value.trim();
  if (!name || !gameId) return;
  const selectedGame = gameId;
  mutate(async () => {
    const player = await api(`/players?name=${encodeURIComponent(name)}`,'POST');
    await api(`/games/${selectedGame}/join?player_id=${player.id}`,'POST');
    $('name').value = '';
  });
};
$('join').onclick = () => mutate(() => api(`/games/${gameId}/join?player_id=${$('registered').value}`,'POST'));
$('reset-all').onclick = () => {
  if (confirm('Reset every score in this game to zero?')) mutate(() => api(`/games/${gameId}/reset`,'POST'));
};
refresh().catch(showError);
setInterval(() => { if (!busy && !document.hidden) refresh().catch(showError); }, 2000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy) refresh().catch(showError); });
