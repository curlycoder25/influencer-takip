const status = document.getElementById('status');
async function openEditor() {
  const key = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  if (!/^[A-Za-z0-9_-]{43}$/.test(key)) {
    status.textContent = 'Düzenleme bağlantısı eksik veya geçersiz.';
    return;
  }
  try {
    const response = await fetch('/edit/link-session', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({key})
    });
    if (!response.ok) throw new Error();
    location.replace('/edit');
  } catch {
    status.textContent = 'Düzenleme bağlantısı açılamadı. Paylaşılan bağlantıyı yeniden aç.';
  }
}
openEditor();
