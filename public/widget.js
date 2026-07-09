/**
 * widget.js — Voltek Chat Widget
 * -----------------------------------------------------------------------
 * El profesor pega este script en su web y aparece un botón flotante
 * que abre el chat de su asistente Voltek en un iframe.
 *
 * Uso:
 * <script src="https://voltek.app/widget.js" data-slug="cris-padel"></script>
 * -----------------------------------------------------------------------
 */
(function () {
  const script = document.currentScript || document.querySelector('script[data-slug]');
  const slug = script?.getAttribute('data-slug');
  if (!slug) return;

  const BASE = 'https://voltek.app';
  const CHAT_URL = `${BASE}/${slug}/chat`;
  const COLOR_AMBER = '#E8A020';
  const COLOR_DARK = '#09090F';

  // Estilos globales
  const style = document.createElement('style');
  style.textContent = `
    #voltek-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: ${COLOR_DARK};
      border: 2px solid ${COLOR_AMBER};
      box-shadow: 0 4px 20px rgba(9,9,15,0.3);
      cursor: pointer;
      z-index: 9998;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    #voltek-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 28px rgba(9,9,15,0.4);
    }
    #voltek-badge {
      position: fixed;
      bottom: 84px;
      right: 24px;
      background: ${COLOR_DARK};
      color: #F4EFE6;
      font-size: 12px;
      font-family: system-ui, sans-serif;
      padding: 6px 12px;
      border-radius: 20px;
      border: 1px solid rgba(232,160,32,0.3);
      white-space: nowrap;
      z-index: 9997;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
    }
    #voltek-badge.visible {
      opacity: 1;
      transform: translateY(0);
    }
    #voltek-iframe-container {
      position: fixed;
      bottom: 88px;
      right: 24px;
      width: 360px;
      height: 560px;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(9,9,15,0.4);
      z-index: 9999;
      display: none;
      border: 1px solid rgba(255,255,255,0.1);
    }
    #voltek-iframe-container.open {
      display: block;
      animation: voltekSlideIn 0.25s ease;
    }
    #voltek-iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    @keyframes voltekSlideIn {
      from { opacity: 0; transform: translateY(16px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (max-width: 480px) {
      #voltek-iframe-container {
        bottom: 0;
        right: 0;
        width: 100vw;
        height: 85vh;
        border-radius: 20px 20px 0 0;
      }
    }
  `;
  document.head.appendChild(style);

  // Badge "¿Tienes dudas?"
  const badge = document.createElement('div');
  badge.id = 'voltek-badge';
  badge.textContent = '¿Tienes dudas? Pregúntame';
  document.body.appendChild(badge);

  // Mostrar badge después de 3s
  setTimeout(() => badge.classList.add('visible'), 3000);
  setTimeout(() => badge.classList.remove('visible'), 8000);

  // Botón flotante
  const btn = document.createElement('button');
  btn.id = 'voltek-btn';
  btn.setAttribute('aria-label', 'Abrir asistente Voltek');
  btn.innerHTML = `
    <svg width="26" height="26" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="${COLOR_AMBER}"/>
      <rect x="16" y="5" width="5" height="18" rx="1" fill="#F4EFE6"/>
      <polygon points="21,5 27,5 21,14" fill="#F4EFE6"/>
      <polygon points="21,14 27,23 21,23" fill="#F4EFE6"/>
    </svg>
  `;
  document.body.appendChild(btn);

  // Contenedor del iframe
  const container = document.createElement('div');
  container.id = 'voltek-iframe-container';
  const iframe = document.createElement('iframe');
  iframe.id = 'voltek-iframe';
  iframe.src = CHAT_URL;
  iframe.title = 'Asistente Voltek';
  container.appendChild(iframe);
  document.body.appendChild(container);

  // Toggle
  let open = false;
  btn.addEventListener('click', () => {
    open = !open;
    badge.classList.remove('visible');
    if (open) {
      container.classList.add('open');
      btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#F4EFE6" stroke-width="2" stroke-linecap="round"/></svg>`;
    } else {
      container.classList.remove('open');
      btn.innerHTML = `
        <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
          <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="${COLOR_AMBER}"/>
          <rect x="16" y="5" width="5" height="18" rx="1" fill="#F4EFE6"/>
          <polygon points="21,5 27,5 21,14" fill="#F4EFE6"/>
          <polygon points="21,14 27,23 21,23" fill="#F4EFE6"/>
        </svg>
      `;
    }
  });
})();
