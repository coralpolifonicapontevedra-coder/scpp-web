(() => {
  if (!document.querySelector('#panel-historico')) return;
  const script = document.createElement('script');
  script.src = '/js/historico-historia-es.js?v=20260828-3';
  script.async = false;
  document.body.appendChild(script);
})();
