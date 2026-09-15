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
  nomeEs?: string;
  nome_es?: string;
  cidade?: string;
  lugar?: string;
  caracteristicas?: string;
  caracteristicasEs?: string;
  caracteristicas_es?: string;
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
  String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const dataHoxeMadrid = () => {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

export async function obterConcertos(): Promise<Concerto[]> {
  try {
    const resposta = await fetch('/api/concertos-indice', { cache: 'no-store' });
    const indice = await resposta.json().catch(() => null);
    if (!resposta.ok || indice?.ok !== true || !Array.isArray(indice?.concertos)) {
      throw new Error(indice?.erro || `HTTP ${resposta.status}`);
    }

    const hoxe = dataHoxeMadrid();
    return indice.concertos
      .filter((concerto: Concerto) => concerto?.id && concerto?.data && concerto?.nome)
      .map((concerto: Concerto) => ({
        ...concerto,
        mostrarWeb: concerto.mostrarWeb !== false,
        destacadoWeb: concerto.destacadoWeb === true,
        programa: Array.isArray(concerto.programa) ? concerto.programa : [],
      }))
      .filter((concerto: Concerto) => {
        const estado = normalizar(concerto.estado);
        return ['previsto', 'confirmado'].includes(estado) && dataISO(concerto.data) >= hoxe;
      })
      .sort((a: Concerto, b: Concerto) => dataISO(a.data).localeCompare(dataISO(b.data)));
  } catch (erro) {
    console.warn('Non se puido cargar o índice rápido de concertos:', erro);
    return [];
  }
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
  if (partes.length !== 3 || partes.some(Number.isNaN)) return data;
  if (partes[0] > 31) return `${partes[0]}-${String(partes[1]).padStart(2, '0')}-${String(partes[2]).padStart(2, '0')}`;
  return `${partes[2]}-${String(partes[1]).padStart(2, '0')}-${String(partes[0]).padStart(2, '0')}`;
};
