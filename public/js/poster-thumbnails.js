(() => {
  const selector = '.agenda-page .poster-thumb img';
  const supportedPoster = /\.(?:jpe?g|png|webp)$/i;
  const thumbnailSuffix = '.thumb.webp';

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
