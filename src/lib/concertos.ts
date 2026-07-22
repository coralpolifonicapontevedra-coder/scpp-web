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

const URL_CONCERTOS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSX8BEJ-hrubqEtaZ1zZaLSy7LoxaDQOuQuqR2ior7TZErtBGL5bJG0B_AK5Dp8eFeTDb3Pmpqh7Hnu/pub?gid=1098509641&single=true&output=csv';
const URL_PROGRAMAS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTMm4Z45Bcfz_-AEwcA6lNmttLAjJEOxXpTFmlnLwtRCoSIF7xlCP-LEdlfLoMYkbOnAefC7I9G9Cec/pub?gid=1925601694&single=true&output=csv';
const URL_REPERTORIO = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSuYtrIlKLbU1QkH7fP2zbKQQYFV6kvACLLFBZrJ7cC8t54jAsrTDWvL_x7fko9Hw71oKIoYyBcjNF3/pub?gid=984049442&single=true&output=csv';

const normalizar = (valor = '') =>
  String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const verdadeiro = (valor = '') => ['true', 'si', 'sí', 'yes', '1', 'verdadeiro'].includes(normalizar(valor));

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

async function lerCSV(url: string): Promise<Record<string, string>[]> {
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return parseCSV(await resposta.text());
  } catch (erro) {
    console.warn(`Non se puido ler ${url}:`, erro);
    return [];
  }
}

export async function obterConcertos(): Promise<Concerto[]> {
  const [filasConcertos, filasProgramas, filasRepertorio] = await Promise.all([
    lerCSV(URL_CONCERTOS),
    lerCSV(URL_PROGRAMAS),
    lerCSV(URL_REPERTORIO),
  ]);

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
  const partes = data.split(/[\/-]/).map(Number);
  let valorData: Date;

  if (partes.length === 3 && partes[0] > 31) {
    valorData = new Date(partes[0], partes[1] - 1, partes[2], 12);
  } else if (partes.length === 3) {
    valorData = new Date(partes[2], partes[1] - 1, partes[0], 12);
  } else {
    valorData = new Date(`${data}T12:00:00`);
  }

  if (Number.isNaN(valorData.getTime())) return data;
  return new Intl.DateTimeFormat(
    'gl-ES',
    formato === 'curto'
      ? { day: '2-digit', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'long', year: 'numeric' },
  ).format(valorData);
};

export const dataISO = (data: string) => {
  const partes = data.split(/[\/-]/).map(Number);
  if (partes.length !== 3) return data;
  if (partes[0] > 31) return `${partes[0]}-${String(partes[1]).padStart(2, '0')}-${String(partes[2]).padStart(2, '0')}`;
  return `${partes[2]}-${String(partes[1]).padStart(2, '0')}-${String(partes[0]).padStart(2, '0')}`;
};
