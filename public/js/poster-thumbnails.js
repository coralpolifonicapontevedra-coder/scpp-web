(() => {
  const selector = '.agenda-page .poster-thumb img';
  const supportedPoster = /\.(?:jpe?g|png|webp)$/i;
  const thumbnailSuffix = '.thumb.webp';

  const installMobileAgendaStyles = () => {
    if (document.querySelector('#agenda-mobile-layout-fix')) return;

    const style = document.createElement('style');
    style.id = 'agenda-mobile-layout-fix';
    style.textContent = `
      @media (max-width: 650px) {
        .agenda-page .concert-card.has-poster {
          display: flex !important;
          flex-direction: column !important;
          grid-template-columns: none !important;
          gap: 1.25rem !important;
          width: 100% !important;
          min-width: 0 !important;
        }

        .agenda-page .concert-card.has-poster .poster-thumb {
          order: -1;
          width: 100% !important;
          max-width: none !important;
          margin: 0 auto !important;
        }

        .agenda-page .concert-card.has-poster .poster-thumb img {
          width: min(100%, 320px) !important;
          max-width: 320px !important;
          max-height: none !important;
          margin: 0 auto !important;
          object-fit: contain !important;
        }

        .agenda-page .concert-card.has-poster .poster-thumb span {
          margin-top: .55rem !important;
          font-size: .8rem !important;
        }

        .agenda-page .concert-card .concert-content,
        .agenda-page .concert-card .description,
        .agenda-page .concert-card .programa,
        .agenda-page .concert-card .documentos {
          width: 100% !important;
          max-width: none !important;
          min-width: 0 !important;
        }

        .agenda-page .concert-card .description {
          margin-right: 0 !important;
          margin-left: 0 !important;
          line-height: 1.65 !important;
          overflow-wrap: normal !important;
          word-break: normal !important;
          hyphens: none !important;
        }

        .agenda-page .concert-card .concert-meta {
          display: grid !important;
          grid-template-columns: 1fr !important;
          gap: .55rem !important;
        }

        .agenda-page .historical-item.has-poster .historical-main {
          display: flex !important;
          flex-direction: column !important;
          grid-template-columns: none !important;
          gap: 1rem !important;
        }

        .agenda-page .historical-item.has-poster .poster-thumb {
          order: -1;
          width: 100% !important;
          max-width: none !important;
        }

        .agenda-page .historical-item.has-poster .poster-thumb img {
          width: min(100%, 280px) !important;
          max-width: 280px !important;
          max-height: none !important;
          margin: 0 auto !important;
        }
      }
    `;

    document.head.appendChild(style);
  };

  const getThumbnailUrl = (source) => {
    try {
      const url = new URL(source, window.location.href);
      if (url.origin !== window.location.origin) return '';
      if (!url.pathname.startsWith('/img/concertos/')) return '';
      if (!supportedPoster.test(url.pathname) || url.pathname.endsWith(thumbnailSuffix)) return '';

      url.pathname = `${url.pathname}${thumbnailSuffix}`;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return '';
    }
  };

  const optimisePoster = (image) => {
    if (!(image instanceof HTMLImageElement)) return;
    if (image.dataset.posterThumbReady === 'true') return;

    const original = image.getAttribute('src') || '';
    const thumbnail = getThumbnailUrl(original);
    if (!thumbnail) return;

    image.dataset.posterThumbReady = 'true';
    image.dataset.posterOriginal = original;
    image.decoding = 'async';

    image.addEventListener(
      'error',
      () => {
        if (image.getAttribute('src') !== original) image.src = original;
      },
      { once: true },
    );

    image.src = thumbnail;
  };

  const scan = (root) => {
    if (root instanceof HTMLImageElement && root.matches(selector)) optimisePoster(root);
    if (!(root instanceof Element || root instanceof Document)) return;
    root.querySelectorAll(selector).forEach(optimisePoster);
  };

  const start = () => {
    installMobileAgendaStyles();
    scan(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) scan(node);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
