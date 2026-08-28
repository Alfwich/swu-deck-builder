async function readPayload(response) {
  return response.json().catch(() => ({}))
}

export async function loadDesktopSettings({ signal } = {}) {
  const response = await fetch('/api/desktop/settings', { signal })
  const payload = await readPayload(response)
  if (!response.ok) {
    throw new Error(payload.error ?? 'Desktop settings could not be loaded.')
  }
  return payload
}

export async function saveDesktopSettings(settings) {
  const response = await fetch('/api/desktop/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  const payload = await readPayload(response)
  if (!response.ok) {
    throw new Error(payload.error ?? 'Desktop settings could not be saved.')
  }
  return payload
}
