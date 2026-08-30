const routes = [
  '/', '/acoral/', '/historia/', '/centenario/', '/directora/', '/xunta-directiva/',
  '/coralistas/', '/distincions/', '/honras/', '/benvida/', '/axenda/', '/actualidade/',
  '/galeria/', '/historico-concertos/', '/colabora/', '/colaboradores/', '/contacto/',
  '/privacidade/', '/aviso-legal/', '/cookies/', '/es/', '/es/la-coral/', '/es/historia/',
  '/es/centenario/', '/es/directora/', '/es/junta-directiva/', '/es/coralistas/',
  '/es/distinciones/', '/es/honores/', '/es/bienvenida/', '/es/agenda/', '/es/actualidad/',
  '/es/galeria/', '/es/historico-conciertos/', '/es/colabora/', '/es/colaboradores/',
  '/es/contacto/', '/es/privacidad/', '/es/aviso-legal/', '/es/cookies/'
];

export function GET({ site }) {
  const base = site ?? new URL('https://coralpolifonicapontevedra.org');
  const urls = routes.map((route) => `  <url><loc>${new URL(route, base)}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  });
}
