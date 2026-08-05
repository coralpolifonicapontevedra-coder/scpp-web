const ficheiros = [
  ['1.Cartel.124520.jpg', 'concertos/imaxes/objetos/5d05628ba4b05aea81bff8545177cba1.jpg', 'image/jpeg', 1457954],
  ['2.Cartel.215210.jpg', 'concertos/imaxes/objetos/9300b46b92396dce8dd66fda3b29ca6f.jpg', 'image/jpeg', 261135],
  ['3.Cartel.215409.jpg', 'concertos/imaxes/objetos/9c9713ce419da52fd13c99c8d38adc5f.jpg', 'image/jpeg', 370403],
  ['4.Cartel.Museo.Castelao.jpg', 'concertos/imaxes/objetos/6d612d77401c543619c0a4232547382d.jpg', 'image/jpeg', 229891],
  ['5.Cartel.104100.png', 'concertos/imaxes/objetos/6a3ca161dd512cca70a8ee7d4d468836.png', 'image/png', 321559],
  ['aadc3347.Cartel.091334.png', 'concertos/imaxes/objetos/e90a83729b8aa3a7ef9abcb0b5d04902.png', 'image/png', 2099240],
  ['1.Triptico.124520.jpg', 'concertos/documentos/objetos/d91193d873671df0dd549298428ce378.jpg', 'image/jpeg', 3669768],
  ['3.Triptico.215409.jpg', 'concertos/documentos/objetos/d91193d873671df0dd549298428ce378.jpg', 'image/jpeg', 3669768],
  ['4.Triptico.215538.pdf', 'concertos/documentos/objetos/91fba57254982b1c268fa47255a70cf7.pdf', 'application/pdf', 362408],
  ['2.Prensa.093913.pdf', 'concertos/documentos/objetos/10ac083952a97f893748c566f25c3c22.pdf', 'application/pdf', 15672282],
  ['4.Prensa.210643.pdf', 'concertos/documentos/objetos/5af6ae37777bb368d5b6f98d8604333c.pdf', 'application/pdf', 1484579]
];

export const CONCERT_MEDIA_BY_NAME = Object.fromEntries(
  ficheiros.map(([name, r2Key, mimeType, size]) => [name.toLocaleLowerCase('gl'), {
    name, r2Key, mimeType, size
  }])
);

export const CONCERT_PROGRAM_BY_ID = {
  '1': CONCERT_MEDIA_BY_NAME['1.triptico.124520.jpg'],
  '2': CONCERT_MEDIA_BY_NAME['1.triptico.124520.jpg'],
  '3': CONCERT_MEDIA_BY_NAME['3.triptico.215409.jpg'],
  '4': CONCERT_MEDIA_BY_NAME['4.triptico.215538.pdf']
};

export function concertMediaByName(value) {
  return CONCERT_MEDIA_BY_NAME[String(value || '').trim().toLocaleLowerCase('gl')] || null;
}

