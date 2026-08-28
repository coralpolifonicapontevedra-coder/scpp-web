(() => {
  const ruta = window.location.pathname.replace(/\/+$/, '') || '/';
  if (ruta !== '/es/actualidad') return;

  const titulos = new Map([
    ['A mocidade da Coral toma a palabra', 'La juventud de la Coral toma la palabra'],
    ['As Cantigas de Santa María no Museo de Pontevedra', 'Las Cantigas de Santa María en el Museo de Pontevedra'],
    ['A Polifónica recibe a Vieira de Honra e renova a presidencia', 'La Polifónica recibe la Vieira de Honor y renueva la presidencia'],
    ['Recepción oficial á nova directiva da Coral', 'Recepción oficial a la nueva directiva de la Coral'],
    ['José Raposeiras: «A Polifónica é cultura de Pontevedra»', 'José Raposeiras: «La Polifónica es cultura de Pontevedra»'],
    ['A Deputación recibe á nova directiva da Coral', 'La Diputación recibe a la nueva directiva de la Coral'],
    ['Entrega do Premio Otero Pedrayo 2025 á Coral', 'Entrega del Premio Otero Pedrayo 2025 a la Coral'],
    ['Falece Agustín Bertomeu, director da Coral entre 1968 e 1977', 'Fallece Agustín Bertomeu, director de la Coral entre 1968 y 1977'],
    ['A Coral lembra o legado de Agustín Bertomeu Salazar', 'La Coral recuerda el legado de Agustín Bertomeu Salazar'],
    ['O músico que lle puxo swing á Polifónica', 'El músico que le puso swing a la Polifónica'],
    ['Especial 100 anos da Sociedade Coral Polifónica de Pontevedra', 'Especial 100 años de la Sociedad Coral Polifónica de Pontevedra'],
    ['Premio Otero Pedrayo 2025 para a Sociedade Coral Polifónica de Pontevedra', 'Premio Otero Pedrayo 2025 para la Sociedad Coral Polifónica de Pontevedra'],
    ['Vieira de Honra á Sociedade Coral Polifónica de Pontevedra', 'Vieira de Honor a la Sociedad Coral Polifónica de Pontevedra'],
    ['A Sociedade Coral Polifónica de Pontevedra celebra 100 anos', 'La Sociedad Coral Polifónica de Pontevedra celebra 100 años'],
    ['Presentación do selo conmemorativo do centenario', 'Presentación del sello conmemorativo del centenario'],
    ['Concerto do centenario na igrexa de San Francisco: 100 anos da Polifónica', 'Concierto del centenario en la iglesia de San Francisco: 100 años de la Polifónica'],
    ['O Museo de Pontevedra acolle a exposición do centenario da Polifónica', 'El Museo de Pontevedra acoge la exposición del centenario de la Polifónica'],
    ['O centenario da Polifónica chega ao Museo de Pontevedra', 'El centenario de la Polifónica llega al Museo de Pontevedra'],
    ['Unha exposición percorre un século de historia da Polifónica de Pontevedra', 'Una exposición recorre un siglo de historia de la Polifónica de Pontevedra'],
    ['Recoñecemento ás Persoas Galegas do Ano 2025', 'Reconocimiento a las Personas Gallegas del Año 2025'],
    ['Concerto homenaxe da Sociedade Filharmónica á Coral Polifónica polo centenario', 'Concierto homenaje de la Sociedad Filarmónica a la Coral Polifónica por el centenario'],
    ['Concerto de Nadal do centenario da Sociedade Coral Polifónica de Pontevedra', 'Concierto de Navidad del centenario de la Sociedad Coral Polifónica de Pontevedra'],
    ['Bicentenario Marcial del Adalid: a memoria cantada', 'Bicentenario Marcial del Adalid: la memoria cantada']
  ]);

  const tipos = new Map([
    ['Axenda cultural', 'Agenda cultural'],
    ['Especial xornalístico', 'Especial periodístico'],
    ['Reportaxe cultural', 'Reportaje cultural'],
    ['Noticia cultural', 'Noticia cultural'],
    ['Noticia institucional', 'Noticia institucional'],
    ['Nota institucional', 'Nota institucional'],
    ['Crónica de opinión', 'Crónica de opinión'],
    ['Entrevista', 'Entrevista'],
    ['Noticia', 'Noticia'],
    ['Reseña institucional', 'Reseña institucional']
  ]);

  const traducirNodo = (nodo, mapa) => {
    if (!(nodo instanceof HTMLElement)) return;
    const actual = nodo.textContent?.trim() || '';
    const traducido = mapa.get(actual);
    if (traducido && traducido !== actual) nodo.textContent = traducido;
  };

  const traducir = () => {
    document
      .querySelectorAll('#destacada-titulo-ligazon, .publicacion h3 a')
      .forEach((nodo) => traducirNodo(nodo, titulos));

    document
      .querySelectorAll('#destacada-tipo, .publicacion-meta span')
      .forEach((nodo) => traducirNodo(nodo, tipos));
  };

  const raiz = document.querySelector('.actualidade');
  if (!raiz) return;

  traducir();
  const observador = new MutationObserver(traducir);
  observador.observe(raiz, { childList: true, subtree: true, characterData: true });
})();
