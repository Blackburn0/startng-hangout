// start.ng owns sign-in. The game talks to it through a hidden start.ng/connect page:
// who is signed in ({ id, name, style } or null), and a ticket into the live room.
// The game never sees the start.ng token or email.

// Where start.ng lives, worked out from where this game is served.
function findStartNg() {
  const { hostname } = location;
  if (hostname.endsWith('.start.ng')) return 'https://start.ng';
  if (hostname.endsWith('.start.localhost')) return 'http://start.localhost:5173'; // local testing
  return null; // anywhere else (e.g. GitHub Pages) there's no start.ng, so guests only
}

/** start.ng's address, or null when the game runs somewhere start.ng can't reach. */
export const START_NG = findStartNg();

let frame;
function connectFrame() {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.title = 'start.ng sign-in check';
    el.addEventListener('load', () => resolve(el), { once: true });
    el.addEventListener('error', reject, { once: true });
    document.body.append(el);
  });
  return frame;
}

// Sends a message to start.ng/connect and resolves to its reply, or undefined if start.ng
// isn't there or didn't answer in time.
async function ask(message, replyType, timeoutMs = 3000) {
  if (!START_NG) return undefined;
  let el;
  try {
    el = await connectFrame();
  } catch {
    return undefined;
  }
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply) => {
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      resolve(reply);
    };
    const timer = setTimeout(() => done(undefined), timeoutMs);
    function onMessage(e) {
      if (e.origin !== START_NG || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    el.contentWindow.postMessage({ ...message, requestId }, START_NG);
  });
}

// Resolves to the user, null (signed out), or undefined if start.ng didn't answer.
async function check() {
  if (!START_NG) return null;
  const reply = await ask({ type: 'startng:whoami' }, 'startng:user');
  return reply && (reply.user ?? null);
}

/** The signed-in start.ng user ({ id, name, style }), or null. */
export async function getCurrentUser() {
  return (await check()) ?? null;
}

/**
 * Re-checks when the player comes back to this tab or window, since they may have
 * signed in or out on start.ng.
 */
export function onUserChange(fn) {
  const recheck = async () => {
    if (document.visibilityState !== 'visible') return;
    const user = await check();
    if (user !== undefined) fn(user); // ignore a check that failed, rather than signing the player out
  };
  document.addEventListener('visibilitychange', recheck);
  addEventListener('focus', recheck);
}

/**
 * A one-minute ticket into this game's live room: { ticket, url }. Open `${url}?ticket=${ticket}`.
 * Resolves to { error } when start.ng says no (e.g. signed out), or null if it didn't answer.
 */
export async function getLiveTicket() {
  const reply = await ask({ type: 'startng:ticket' }, 'startng:ticketData', 8000);
  if (!reply) return null;
  return reply.ok ? { ticket: reply.ticket, url: reply.url } : { error: reply.error };
}

/** Sends the player to start.ng to sign in. start.ng brings them back here afterwards. */
export function signIn() {
  location.href = `${START_NG}/?return_to=${encodeURIComponent(location.href)}`;
}
