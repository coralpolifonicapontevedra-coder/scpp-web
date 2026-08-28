(() => {
  'use strict';

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path !== '/portal/ensaios/estudo') return;
  if (window.__scppStudyBlobBridgeInstalled) return;
  window.__scppStudyBlobBridgeInstalled = true;

  const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
  const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  const nativeFetch = window.fetch.bind(window);
  const blobs = new Map();

  URL.createObjectURL = function createObjectURL(object) {
    const url = nativeCreateObjectURL(object);
    if (object instanceof Blob) blobs.set(url, object);
    return url;
  };

  URL.revokeObjectURL = function revokeObjectURL(url) {
    blobs.delete(String(url || '').split('#')[0]);
    return nativeRevokeObjectURL(url);
  };

  window.fetch = function bridgedFetch(input, init) {
    let url = '';
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.href;
    else if (input && typeof input.url === 'string') url = input.url;

    const base = url.split('#')[0];
    const blob = blobs.get(base);
    if (blob) {
      return Promise.resolve(new Response(blob, {
        status: 200,
        headers: {
          'Content-Type': blob.type || 'application/octet-stream',
          'Content-Length': String(blob.size)
        }
      }));
    }

    return nativeFetch(input, init);
  };
})();
