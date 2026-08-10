export type PortalNavigationSurface = 'sidebar' | 'home';

export type PortalNavigationModule = {
  id: string;
  label: string;
  path: string;
  enabled: boolean;
  order: number;
  surfaces: PortalNavigationSurface[];
  sidebarEnabled?: boolean;
  homeEnabled?: boolean;
  homeTitle?: string;
  homeDescription?: string;
  homeNumber?: string;
  adminOnly?: boolean;
  homeCardId?: string;
  statusText?: string;
};

export const PORTAL_NAVIGATION_MODULES: PortalNavigationModule[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    path: '/portal/',
    enabled: true,
    order: 10,
    surfaces: ['sidebar'],
  },
  {
    id: 'subir',
    label: 'Subir fotografías',
    path: '/portal/fotos/',
    enabled: true,
    order: 40,
    surfaces: ['sidebar', 'home'],
    homeTitle: 'Galería e fotografías',
    homeDescription: 'Consulta e achega novas fotografías ao arquivo da Coral.',
    homeNumber: '04',
  },
  {
    id: 'revisar',
    label: 'Revisar fotografías',
    path: '/portal/revision-fotos/',
    enabled: true,
    order: 90,
    surfaces: ['sidebar'],
    adminOnly: true,
  },
  {
    id: 'repertorio',
    label: 'Repertorio',
    path: '/portal/repertorio/',
    enabled: true,
    order: 50,
    surfaces: ['sidebar', 'home'],
    homeDescription: 'Partituras, audios por corda, vídeos e notas de traballo.',
    homeNumber: '02',
  },
  {
    id: 'concertos',
    label: 'Concertos',
    path: '/portal/concertos/',
    enabled: true,
    order: 60,
    surfaces: ['sidebar', 'home'],
    homeDescription: 'Convocatorias, horarios, programas e información práctica.',
    homeNumber: '01',
  },
  {
    id: 'ensaios',
    label: 'Ensaios',
    path: '/portal/ensaios/',
    enabled: false,
    order: 70,
    surfaces: ['sidebar', 'home'],
    homeDescription: 'Calendario, avisos, asistencia e materiais de preparación.',
    homeNumber: '03',
    statusText: 'Próximamente',
  },
  {
    id: 'galeria',
    label: 'Galería',
    path: '/portal/galeria/',
    enabled: true,
    order: 80,
    surfaces: ['sidebar'],
  },
  {
    id: 'documentacion',
    label: 'Documentación',
    path: '/portal/documentacion/',
    enabled: true,
    order: 100,
    surfaces: ['sidebar', 'home'],
    homeDescription: 'Actas, estatutos, transparencia e documentación interna.',
    homeNumber: '05',
  },
  {
    id: 'perfil',
    label: 'O meu perfil',
    path: '/portal/perfil/',
    enabled: true,
    order: 110,
    surfaces: ['sidebar', 'home'],
    sidebarEnabled: true,
    homeEnabled: true,
    homeDescription: 'Datos persoais, contacto e preferencias da túa conta.',
    homeNumber: '06',
  },
  {
    id: 'administracion',
    label: 'Administración',
    path: '/portal/administracion/persoas/',
    enabled: true,
    order: 120,
    surfaces: ['sidebar'],
  },
];

export function getPortalNavigationModules(surface: PortalNavigationSurface): PortalNavigationModule[] {
  return PORTAL_NAVIGATION_MODULES
    .filter((module) => module.surfaces.includes(surface))
    .sort((a, b) => a.order - b.order);
}

export function getPortalNavigationLabel(active: string, fallback = 'Menú do portal'): string {
  const normalized = String(active || '').trim();
  if (!normalized) return fallback;
  const found = PORTAL_NAVIGATION_MODULES.find((module) => module.id === normalized);
  return found?.label || fallback;
}
