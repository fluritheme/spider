import { renderGrowth } from './dashboard-growth';
import type { growthStatistics } from '../workers/growth';

const login = document.querySelector<HTMLElement>('#login')!;
const dashboard = document.querySelector<HTMLElement>('#dashboard')!;
const message = document.querySelector<HTMLElement>('#message')!;
const form = document.querySelector<HTMLFormElement>('#login-form')!;
const password = document.querySelector<HTMLInputElement>('#password')!;
const refresh = document.querySelector<HTMLButtonElement>('#refresh')!;
const logout = document.querySelector<HTMLButtonElement>('#logout')!;
let busy = false;
function signedOut(): void {
  dashboard.hidden = true;
  document.querySelector('#growth')!.replaceChildren();
  login.hidden = false;
}
async function load(): Promise<void> {
  const response = await fetch('/api/dashboard/growth', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (response.status === 401) {
    signedOut();
    message.textContent = '';
    return;
  }
  if (!response.ok) throw new Error('Analytics is temporarily unavailable. Please retry.');
  const data = (await response.json()) as Awaited<ReturnType<typeof growthStatistics>>;
  document.querySelector('#growth')!.innerHTML = renderGrowth(data);
  document.querySelector('#updated')!.textContent =
    `Updated ${new Date(data.updatedAt).toLocaleTimeString()}`;
  login.hidden = true;
  dashboard.hidden = false;
  message.textContent = '';
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  const button = form.querySelector('button')!;
  button.disabled = true;
  message.textContent = 'Signing in…';
  try {
    const response = await fetch('/api/dashboard/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password: password.value }),
    });
    password.value = '';
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error ?? 'Could not sign in.');
    }
    await load();
  } catch (error) {
    message.textContent =
      error instanceof Error ? error.message : 'Could not sign in. Please retry.';
  } finally {
    button.disabled = false;
    busy = false;
  }
});
refresh.addEventListener('click', async () => {
  refresh.disabled = true;
  message.textContent = 'Refreshing…';
  try {
    await load();
  } catch {
    message.textContent = 'Could not refresh. Your previous figures are still shown.';
  } finally {
    refresh.disabled = false;
  }
});
logout.addEventListener('click', async () => {
  logout.disabled = true;
  try {
    const response = await fetch('/api/dashboard/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!response.ok && response.status !== 401) throw new Error();
    signedOut();
    message.textContent = 'Signed out.';
    password.focus();
  } catch {
    message.textContent = 'Sign-out failed. Please retry.';
  } finally {
    logout.disabled = false;
  }
});
void load().catch(() => {
  signedOut();
  message.textContent = 'Could not check your session. You can sign in to retry.';
});
