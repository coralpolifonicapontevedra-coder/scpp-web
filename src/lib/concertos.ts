export type ProgramaItem = {
  orde: number;
  obra: string;
  autor?: string;
  notas?: string;
  solista?: string;
};

export type Concerto = {
  id: string;
  data: string;
  nome: string;
  cidade?: string;
  lugar?: string;
  caracteristicas?: string;
  cartel?: string;
  triptico?: string;
  prensa?: string;
  hora?: string;
  mostrarWeb: boolean;
  destacadoWeb: boolean;
  estado: string;
  programa: ProgramaItem[];
};

const normalizar = (valor = '') =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const verdadeiro = (valor = '') => ['true', 'si', 'sí', 'yes', '1'].includes(normalizar(valor));

function parseCSV(texto: string): Record<string, string>[] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const seguinte = texto[i + 1];
    if (c === '"' && entreComillas && seguinte === '"') {
      campo += '"';
      i++;
    } else if (c === '"') {
      entreComillas = !entreComillas;
    } else if (c === ',' && !entreComillas) {
      fila.push(campo);
      campo = '';
    } else if ((c === '\n' || c === '\r') && !entreComillas) {
      if (c === '\r' && seguinte === '\n') i++;
      fila.push(campo);
      if (fila.some((v) => v.trim() !== '')) filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }

  const cabeceiras = (filas.shift() ?? []).map(normalizar);
  return filas.map((valores) =>
    Object.fromEntries(cabeceiras.map((cab, i) => [cab, (valores[i] ?? '').trim()])),
  );
}

const valor = (fila: Record<string, string>, ...nomes: string[]) => {
  for (const nome of nomes) {
    const atopado = fila[normalizar(nome)];
    if (atopado !== undefined && atopado !== '') return atopado;
  }
  return '';
};

async function lerCSV(url?: string): Promise<Record<string, string>[]> {
  if (!url) return [];
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return parseCSV(await resposta.text());
  } catch (erro) {
    console.warn(`Non se puido ler ${url}:`, erro);
    return [];
  }
}

const concertosMostra: Concerto[] = [
  {
    id: 'coruna-2026',
    data: '2026-09-10',
    nome: 'Concerto no Teatro Colón da Coruña',
    cidade: 'A Coruña',
    lugar: 'Teatro Colón',
    caracteristicas: 'Concerto co motivo do bicentenario do nacemento de Marcial del Adalid.',
    mostrarWeb: true,
    destacadoWeb: true,
    estado: 'Confirmado',
    programa: [],
  },
  {
    id: 'outono-2026',
    data: '2026-11-07',
    nome: 'Cantos do Outono',
    cidade: 'Pontevedra',
    lugar: 'Liceo Casino de Pontevedra',
    mostrarWeb: true,
    destacadoWeb: false,
    estado: 'Confirmado',
    programa: [],
  },
];

export async function obterConcertos(): Promise<Concerto[]> {
  const concertosUrl = import.meta.env.CONCERTOS_CSV_URL;
  const programasUrl = import.meta.env.CONCERTOS_REPERTORIO_CSV_URL;
  const repertorioUrl = import.meta.env.REPERTORIO_CSV_URL;

  const [filasConcertos, filasProgramas, filasRepertorio] = await Promise.all([
    lerCSV(concertosUrl),
    lerCSV(programasUrl),
    lerCSV(repertorioUrl),
  ]);

  if (!filasConcertos.length) return concertosMostra;

  const obras = new Map(
    filasRepertorio.map((fila) => [
      valor(fila, 'Id', 'Row ID'),
      {
        nome: valor(fila, 'Nome', 'NomeObra', 'Obra', 'Título', 'Titulo'),
        autor: valor(fila, 'Autor', 'Compositor'),
      },
    ]),
  );

  return filasConcertos
    .map((fila): Concerto => {
      const id = valor(fila, 'Id', 'Row ID');
      const programa = filasProgramas
        .filter((item) => valor(item, 'Id_Conciertos', 'Id_Concertos') === id)
        .map((item) => {
          const idObra = valor(item, 'Id_Obras');
          const obra = obras.get(idObra);
          return {
            orde: Number(valor(item, 'Orde')) || 999,
            obra: obra?.nome || idObra,
            autor: obra?.autor,
            notas: valor(item, 'Notas'),
            solista: valor(item, 'Solista'),
          };
        })
        .sort((a, b) => a.orde - b.orde);

      return {
        id,
        data: valor(fila, 'Data'),
        nome: valor(fila, 'Nome'),
        cidade: valor(fila, 'Cidade'),
        lugar: valor(fila, 'Lugar'),
        caracteristicas: valor(fila, 'Características', 'Caracteristicas'),
        cartel: valor(fila, 'Cartel'),
        triptico: valor(fila, 'Triptico', 'Tríptico'),
        prensa: valor(fila, 'Prensa'),
        hora: valor(fila, 'Hora'),
        mostrarWeb: verdadeiro(valor(fila, 'Mostrar_Web')),
        destacadoWeb: verdadeiro(valor(fila, 'Destacado_Web')),
        estado: valor(fila, 'Estado'),
        programa,
      };
    })
    .filter((concerto) => concerto.mostrarWeb && concerto.id && concerto.data)
    .sort((a, b) => a.data.localeCompare(b.data));
}

export const dataLocal = (data: string, formato: 'curto' | 'longo' = 'longo') => {
  const valorData = new Date(`${data}T12:00:00`);
  if (Number.isNaN(valorData.getTime())) return data;
  return new Intl.DateTimeFormat('gl-ES',
    formato === 'curto'
      ? { day: '2-digit', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'long', year: 'numeric' },
  ).format(valorData);
};
