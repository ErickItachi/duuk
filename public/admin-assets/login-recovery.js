// Compatibility for cached pre-MFA login screens. No account data or tokens
// are read here; activation and reload happen only after the person's click.
(() => {
  if (!('serviceWorker' in navigator)) return
  let mounted = false
  const waitForWorker = (worker, state) => new Promise((resolve, reject) => {
    if (worker.state === state) return resolve()
    const limit = setTimeout(() => { cleanup(); reject(new Error('A atualização demorou. Confira a conexão e tente novamente.')) }, 20000)
    const changed = () => {
      if (worker.state === state) { cleanup(); resolve() }
      else if (worker.state === 'redundant') { cleanup(); reject(new Error('Não foi possível preparar a atualização. Tente novamente.')) }
    }
    const cleanup = () => { clearTimeout(limit); worker.removeEventListener('statechange', changed) }
    worker.addEventListener('statechange', changed)
    changed()
  })
  const inspect = () => {
    const login = document.querySelector('.admin-login'), body = login?.querySelector('.admin-login__body')
    if (mounted || !body || !/DUUK Admin\b/i.test(body.querySelector('h1')?.textContent || '')) return
    mounted = true; observer.disconnect(); clearTimeout(limit)
    const notice = document.createElement('section')
    notice.className = 'admin-update-notice'
    notice.dataset.loginRecovery = 'true'
    const content = document.createElement('div'), title = document.createElement('strong'), message = document.createElement('p'), button = document.createElement('button')
    title.textContent = 'Atualize para concluir a entrada'
    message.textContent = 'Este app ainda está na versão anterior. Atualize para abrir a confirmação do autenticador. Sua conta e os dados do painel serão preservados.'
    message.setAttribute('role', 'status')
    button.type = 'button'; button.className = 'admin-button admin-button--secondary'; button.textContent = 'Atualizar para continuar'
    content.append(title, message); notice.append(content, button); body.prepend(notice)
    button.addEventListener('click', async () => {
      // If the person left login, do not reload a form or another page.
      if (!login.isConnected || document.querySelector('.admin-shell')) return
      button.disabled = true; notice.setAttribute('aria-busy', 'true'); message.textContent = 'Preparando a atualização…'
      try {
        if (navigator.onLine === false) throw new Error('Conecte-se à internet e tente novamente.')
        const registration = await navigator.serviceWorker.getRegistration('/admin/')
        if (!registration) { location.reload(); return }
        await registration.update()
        if (registration.installing) await waitForWorker(registration.installing, 'installed')
        if (registration.waiting) {
          const worker = registration.waiting, activated = waitForWorker(worker, 'activated')
          worker.postMessage({ type: 'SKIP_WAITING' })
          await activated
        }
        if (login.isConnected && !document.querySelector('.admin-shell')) location.reload()
      } catch (cause) {
        message.textContent = cause.message || 'Não foi possível atualizar. Confira a conexão e tente novamente.'
        button.disabled = false; notice.removeAttribute('aria-busy')
      }
    })
  }
  const observer = new MutationObserver(inspect)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  const limit = setTimeout(() => observer.disconnect(), 60000)
  addEventListener('pagehide', () => { observer.disconnect(); clearTimeout(limit) }, { once: true })
  inspect()
})()
