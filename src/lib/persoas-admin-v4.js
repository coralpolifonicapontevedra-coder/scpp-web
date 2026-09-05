import { auth, closePortalSession, waitForPortalUser } from './portal-session.js';

const clean = (value) => value === true ? 'Si' : value === false ? 'Non' : String(value ?? '').trim();
const normalise = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();
const keyOf = (item) => String(item?.idPersoa || item?.id || item?.rowId || '').trim();
const q = (selector) => document.querySelector(selector);

function classifyPerson(item) {
  const tipo = normalise(item?.tipoSocio);
  if (tipo === 'director/a + directiva' || tipo === 'director/a+directiva' || tipo === 'director/a' || tipo === 'director' || tipo === 'directora') return 'director';
  if (tipo === 'colaborador/a' || tipo === 'colaborador' || tipo === 'colaboradora' || tipo === 'socio protector' || tipo === 'socio/a protector/a') return 'collaborator';
  if (tipo === 'cantor/a' || tipo === 'cantor' || tipo === 'cantora') return 'singer';
  return 'other';
}

function relationLabel(item) {
  const type = classifyPerson(item);
  if (type === 'director') return 'Dirección';
  if (type === 'collaborator') return 'Colaborador/a';
  if (type === 'singer') return 'Cantor/a';
  return 'Outra vinculación';
}

function sectionTitle(section) {
  return {
    persoa: 'Identificación',
    contacto: 'Contacto e domicilio',
    coral: 'Relación coa Coral',
    emerxencia: 'Contacto de emerxencia',
    privacidade: 'Privacidade e presenza pública',
    interno: 'Información interna'
  }[section] || 'Datos';
}

async function token() {
  const user = auth.currentUser || await waitForPortalUser();
  if (!user?.email) throw new Error('A sesión non está activa.');
  return user.getIdToken();
}

async function requestV2(action, extra = {}, blob = false) {
  const idToken = await token();
  const response = await fetch('/api/persoas-v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, accion: action, ...extra })
  });
  if (blob && response.ok) return response.blob();
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) throw new Error(result?.erro || `Erro HTTP ${response.status}`);
  return result;
}

async function requestReview(action, extra = {}, blob = false) {
  const idToken = await token();
  const endpoint = action === 'xerarLigazon'
    ? '/api/persoas-revision-link-v4'
    : ['estadoAceptacion', 'obterAceptacion'].includes(action)
      ? '/api/persoas-aceptacion-r2'
      : '/api/persoas-revision';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, accion: action, ...extra })
  });
  if (blob && response.ok) return response.blob();
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) throw new Error(result?.erro || `Erro HTTP ${response.status}`);
  return result;
}

async function requestPhoto(action, idPersoa, blob = false) {
  const idToken = await token();
  const response = await fetch('/api/persoas-foto-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, accion: action, idPersoa })
  });
  if (blob && response.ok) return response.blob();
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) throw new Error(result?.erro || `Erro HTTP ${response.status}`);
  return result;
}

async function uploadPhoto(idPersoa, file) {
  if (!(file instanceof File) || !file.size) return null;
  const idToken = await token();
  const form = new FormData();
  form.set('idToken', idToken);
  form.set('idPersoa', idPersoa);
  form.set('foto', file);
  const response = await fetch('/api/persoas-foto-admin', { method: 'POST', body: form });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) throw new Error(result?.erro || `Erro HTTP ${response.status}`);
  return result;
}

export function initPersoasAdminV4() {
  if (typeof window === 'undefined') return;
  if (window.__scppPersoasAdminV4) return;
  window.__scppPersoasAdminV4 = true;

  const nodes = {
    loading: q('#loading'), error: q('#error-state'), errorMessage: q('#error-message'), retry: q('#retry-button'), app: q('#people-app'), feedback: q('#feedback'),
    email: q('#user-email'), level: q('#user-level'), logout: q('#persoas-v4-logout'),
    total: q('#metric-total'), active: q('#metric-active'), inactive: q('#metric-inactive'), singers: q('#metric-singers'), director: q('#metric-director'), collaborators: q('#metric-collaborators'),
    search: q('#people-search'), status: q('#status-filter'), relation: q('#relation-filter'), voice: q('#voice-filter'), select: q('#person-select'), count: q('#people-count'),
    empty: q('#empty-selection'), card: q('#person-card'), name: q('#person-name'), summary: q('#person-summary'), statusBadge: q('#person-status'), relationBadge: q('#person-relation'), sections: q('#person-sections'),
    photo: q('#person-photo'), photoEmpty: q('#person-photo-empty'), changePhoto: q('#change-photo'),
    edit: q('#edit-person'), review: q('#review-person'), toggle: q('#toggle-person'), openFile: q('#open-file'), openAcceptance: q('#open-acceptance'), remove: q('#delete-person'), create: q('#new-person-button'),
    personDialog: q('#person-dialog'), personForm: q('#person-form'), personTitle: q('#person-dialog-title'), formFields: q('#form-fields'), formPhoto: q('#form-photo'), formPhotoPreview: q('#form-photo-preview'), formPhotoEmpty: q('#form-photo-empty'), closePerson: q('#close-person-dialog'), cancelPerson: q('#cancel-person'), savePerson: q('#save-person'),
    legalData: q('#legal-data-card'), legalFee: q('#legal-fee-card'),
    deleteDialog: q('#delete-dialog'), deleteForm: q('#delete-form'), deleteName: q('#delete-person-name'), deleteConfirmation: q('#delete-confirmation'), closeDelete: q('#close-delete-dialog'), cancelDelete: q('#cancel-delete'), confirmDelete: q('#confirm-delete'),
    reviewDialog: q('#review-dialog'), reviewName: q('#review-person-name'), reviewLink: q('#review-link'), reviewExpiry: q('#review-expiry'), reviewState: q('#review-state'), copyReview: q('#copy-review-link'), closeReviewDialog: q('#close-review-dialog'), closeReview: q('#close-review')
  };

  let people = [];
  let schema = [];
  let legal = {};
  let permission = null;
  let selected = null;
  let formMode = 'create';
  let personPhotoUrl = '';
  let formPhotoUrl = '';
  let fileUrl = '';
  let acceptanceUrl = '';

  function notify(message, kind = 'ok') {
    if (!(nodes.feedback instanceof HTMLElement)) return;
    nodes.feedback.textContent = message;
    nodes.feedback.className = `feedback ${kind === 'error' ? 'is-error' : 'is-ok'}`;
    nodes.feedback.hidden = false;
    window.setTimeout(() => { if (nodes.feedback instanceof HTMLElement) nodes.feedback.hidden = true; }, 5000);
  }

  function showError(error) {
    if (nodes.loading instanceof HTMLElement) nodes.loading.hidden = true;
    if (nodes.app instanceof HTMLElement) nodes.app.hidden = true;
    if (nodes.error instanceof HTMLElement) nodes.error.hidden = false;
    if (nodes.errorMessage instanceof HTMLElement) nodes.errorMessage.textContent = error instanceof Error ? error.message : 'Produciuse un erro inesperado.';
  }

  function canWrite() { return permission?.podeEscribir === true; }
  function canAdmin() { return permission?.podeAdministrar === true; }

  function applyPermissions() {
    if (nodes.level instanceof HTMLElement) nodes.level.textContent = permission?.nivel || 'sen_acceso';
    const write = canWrite();
    const admin = canAdmin();
    [nodes.create, nodes.edit, nodes.review, nodes.toggle, nodes.changePhoto].forEach((button) => {
      if (button instanceof HTMLButtonElement) button.disabled = !write;
    });
    if (nodes.remove instanceof HTMLButtonElement) nodes.remove.disabled = !admin;
  }

  function updateMetrics() {
    const active = people.filter((item) => item?.activo === true).length;
    if (nodes.total instanceof HTMLElement) nodes.total.textContent = String(people.length);
    if (nodes.active instanceof HTMLElement) nodes.active.textContent = String(active);
    if (nodes.inactive instanceof HTMLElement) nodes.inactive.textContent = String(people.length - active);
    if (nodes.singers instanceof HTMLElement) nodes.singers.textContent = String(people.filter((item) => item?.activo === true && classifyPerson(item) === 'singer').length);
    if (nodes.director instanceof HTMLElement) nodes.director.textContent = String(people.filter((item) => classifyPerson(item) === 'director').length);
    if (nodes.collaborators instanceof HTMLElement) nodes.collaborators.textContent = String(people.filter((item) => classifyPerson(item) === 'collaborator').length);
  }

  function uniqueValues(key) {
    return Array.from(new Set(people.map((item) => clean(item?.[key])).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'gl', { sensitivity: 'base' }));
  }

  function refreshVoiceFilter() {
    if (!(nodes.voice instanceof HTMLSelectElement)) return;
    const current = nodes.voice.value;
    nodes.voice.replaceChildren(new Option('Todas as voces', 'all'));
    uniqueValues('voz').forEach((value) => nodes.voice.add(new Option(value, value)));
    nodes.voice.value = Array.from(nodes.voice.options).some((option) => option.value === current) ? current : 'all';
  }

  function filteredPeople() {
    const search = normalise(nodes.search instanceof HTMLInputElement ? nodes.search.value : '');
    const status = nodes.status instanceof HTMLSelectElement ? nodes.status.value : 'all';
    const relation = nodes.relation instanceof HTMLSelectElement ? nodes.relation.value : 'all';
    const voice = nodes.voice instanceof HTMLSelectElement ? nodes.voice.value : 'all';
    return people.filter((item) => {
      if (status === 'active' && item?.activo !== true) return false;
      if (status === 'inactive' && item?.activo === true) return false;
      if (relation !== 'all' && classifyPerson(item) !== relation) return false;
      if (voice !== 'all' && clean(item?.voz) !== voice) return false;
      if (!search) return true;
      return normalise([
        item?.nomeCompleto, item?.nome, item?.primeiroApelido, item?.segundoApelido,
        item?.correo, item?.telefono, item?.nif, item?.cargo, item?.tipoSocio, item?.voz,
        relationLabel(item)
      ].join(' ')).includes(search);
    });
  }

  function renderOptions(preserveId = '') {
    if (!(nodes.select instanceof HTMLSelectElement)) return;
    const visible = filteredPeople();
    const current = preserveId || nodes.select.value;
    nodes.select.replaceChildren(new Option('Escolle unha persoa…', ''));
    visible.forEach((item) => {
      const id = keyOf(item);
      if (!id) return;
      const label = `${item?.etiqueta || item?.nomeCompleto || 'Persoa'}${item?.activo === true ? '' : ' · BAIXA'}`;
      nodes.select.add(new Option(label, id));
    });
    if (current && visible.some((item) => keyOf(item) === current)) nodes.select.value = current;
    if (nodes.count instanceof HTMLElement) nodes.count.textContent = `${visible.length} de ${people.length} persoas`;
    if (current && nodes.select.value !== current) {
      selected = null;
      drawPerson();
    }
  }

  function dataSection(title, fields, showEmpty = false) {
    const visible = showEmpty ? fields : fields.filter((item) => clean(item.value));
    if (!visible.length) return null;
    const section = document.createElement('section');
    section.className = 'data-section';
    const h = document.createElement('h3');
    h.textContent = title;
    const dl = document.createElement('dl');
    visible.forEach(({ label, value }) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = clean(value) || 'Sen indicar';
      dl.append(dt, dd);
    });
    section.append(h, dl);
    return section;
  }

  async function loadPhoto(item) {
    if (personPhotoUrl) { URL.revokeObjectURL(personPhotoUrl); personPhotoUrl = ''; }
    if (nodes.photo instanceof HTMLImageElement) { nodes.photo.hidden = true; nodes.photo.removeAttribute('src'); }
    if (nodes.photoEmpty instanceof HTMLElement) nodes.photoEmpty.hidden = false;
    const id = keyOf(item);
    if (!id || !item?.fotoR2?.key) return;
    try {
      const blob = await requestPhoto('descargar', id, true);
      if (!selected || keyOf(selected) !== id) return;
      personPhotoUrl = URL.createObjectURL(blob);
      if (nodes.photo instanceof HTMLImageElement) { nodes.photo.src = personPhotoUrl; nodes.photo.alt = `Fotografía de ${item?.nomeCompleto || 'persoa'}`; nodes.photo.hidden = false; }
      if (nodes.photoEmpty instanceof HTMLElement) nodes.photoEmpty.hidden = true;
    } catch {
      if (nodes.photoEmpty instanceof HTMLElement) nodes.photoEmpty.hidden = false;
    }
  }

  async function refreshAcceptance(item) {
    if (!(nodes.openAcceptance instanceof HTMLButtonElement)) return;
    nodes.openAcceptance.hidden = true;
    const id = keyOf(item);
    if (!id) return;
    try {
      const result = await requestReview('estadoAceptacion', { idPersoa: id });
      if (selected && keyOf(selected) === id) nodes.openAcceptance.hidden = result?.disponible !== true;
    } catch {
      nodes.openAcceptance.hidden = true;
    }
  }

  function drawPerson() {
    if (nodes.select instanceof HTMLSelectElement && nodes.select.value) selected = people.find((item) => keyOf(item) === nodes.select.value) || null;
    if (nodes.empty instanceof HTMLElement) nodes.empty.hidden = Boolean(selected);
    if (!(nodes.card instanceof HTMLElement)) return;
    nodes.card.hidden = !selected;
    if (!selected) return;

    if (nodes.name instanceof HTMLElement) nodes.name.textContent = selected?.nomeCompleto || [selected?.nome, selected?.primeiroApelido, selected?.segundoApelido].filter(Boolean).join(' ') || 'Persoa sen nome';
    if (nodes.summary instanceof HTMLElement) nodes.summary.textContent = [selected?.voz, selected?.tipoSocio, selected?.cargo].filter(Boolean).join(' · ') || 'Sen clasificación interna';
    if (nodes.statusBadge instanceof HTMLElement) {
      nodes.statusBadge.textContent = selected?.activo === true ? 'Activa' : 'Baixa';
      nodes.statusBadge.classList.toggle('is-inactive', selected?.activo !== true);
    }
    if (nodes.relationBadge instanceof HTMLElement) nodes.relationBadge.textContent = relationLabel(selected);
    if (nodes.openFile instanceof HTMLButtonElement) nodes.openFile.hidden = selected?.fichaDisponibleR2 !== true;
    if (nodes.review instanceof HTMLButtonElement) nodes.review.disabled = !canWrite() || selected?.activo !== true;
    if (nodes.toggle instanceof HTMLButtonElement) {
      nodes.toggle.textContent = selected?.activo === true ? 'Rexistrar baixa' : 'Reactivar persoa';
      nodes.toggle.disabled = !canWrite();
    }
    if (nodes.edit instanceof HTMLButtonElement) nodes.edit.disabled = !canWrite();
    if (nodes.changePhoto instanceof HTMLButtonElement) nodes.changePhoto.disabled = !canWrite();
    if (nodes.remove instanceof HTMLButtonElement) nodes.remove.disabled = !canAdmin();

    if (nodes.sections instanceof HTMLElement) {
      nodes.sections.replaceChildren();
      [
        dataSection('Identificación', [
          { label: 'Nome', value: selected?.nome }, { label: 'Primeiro apelido', value: selected?.primeiroApelido }, { label: 'Segundo apelido', value: selected?.segundoApelido }, { label: 'NIF', value: selected?.nif }, { label: 'Data de nacemento', value: selected?.dataNacemento }, { label: 'Identificador', value: keyOf(selected) }
        ]),
        dataSection('Contacto e domicilio', [
          { label: 'Teléfono', value: selected?.telefono }, { label: 'Correo electrónico', value: selected?.correo }, { label: 'Enderezo', value: selected?.enderezo }, { label: 'Cidade', value: selected?.cidade }, { label: 'Código postal', value: selected?.cp }
        ]),
        dataSection('Contacto de emerxencia', [
          { label: 'Persoa de contacto', value: selected?.contactoEmerxencia }, { label: 'Teléfono de emerxencia', value: selected?.telefonoEmerxencia }
        ], true),
        dataSection('Relación coa Coral', [
          { label: 'Vinculación', value: relationLabel(selected) }, { label: 'Voz', value: selected?.voz }, { label: 'Tipo de socio', value: selected?.tipoSocio }, { label: 'Cargo', value: selected?.cargo }, { label: 'Data de incorporación', value: selected?.dataIncorporacion }, { label: 'Consentimento foto', value: selected?.consentimentoFoto }, { label: 'Mostrar web', value: selected?.mostrarWeb }, { label: 'Mostrar aniversario', value: selected?.mostrarAniversario }, { label: 'Estado da ficha', value: selected?.fichaR2Estado }
        ]),
        dataSection('Información interna', [
          { label: 'Observacións', value: selected?.observacions }, { label: 'Observacións privadas', value: selected?.observacionsPrivadas }
        ])
      ].filter(Boolean).forEach((section) => nodes.sections.append(section));
    }

    void loadPhoto(selected);
    void refreshAcceptance(selected);
  }

  function renderLegalCard(node, value) {
    if (!(node instanceof HTMLElement)) return;
    const legalValue = value && typeof value === 'object' ? value : null;
    node.hidden = !legalValue?.texto;
    if (!legalValue?.texto) return;
    const h = node.querySelector('h3');
    const meta = node.querySelector('.legal-meta');
    const text = node.querySelector('.legal-text');
    if (h instanceof HTMLElement) h.textContent = legalValue.titulo || 'Información legal';
    if (meta instanceof HTMLElement) meta.textContent = [legalValue.version, legalValue.dataVixencia ? `Vixente desde ${legalValue.dataVixencia}` : ''].filter(Boolean).join(' · ');
    if (text instanceof HTMLElement) text.textContent = legalValue.texto;
  }

  function createField(field, value = '') {
    const label = document.createElement('label');
    if (field?.wide) label.classList.add('is-wide');
    const span = document.createElement('span');
    span.textContent = `${field?.label || field?.key || 'Campo'}${field?.required ? ' *' : ''}`;
    label.append(span);

    let input;
    if (field?.type === 'enum') {
      input = document.createElement('select');
      input.append(new Option('— Sen indicar —', ''));
      const options = Array.isArray(field?.options) ? field.options.map(clean).filter(Boolean) : [];
      if (value && !options.some((option) => normalise(option) === normalise(value))) options.push(value);
      options.forEach((option) => input.add(new Option(option, option)));
      input.value = clean(value);
    } else if (field?.type === 'boolean') {
      label.classList.add('check-field');
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = value === true;
      label.replaceChildren(input, span);
    } else if (field?.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
      input.value = clean(value);
    } else {
      input = document.createElement('input');
      input.type = field?.key === 'correo' ? 'text' : (['date', 'tel', 'email'].includes(field?.type) ? field.type : 'text');
      if (field?.key === 'correo') input.inputMode = 'email';
      input.value = clean(value);
    }
    input.dataset.fieldKey = field?.key || '';
    if (field?.required) input.required = true;
    label.append(input);
    return label;
  }

  function renderFormFields(person = null) {
    if (!(nodes.formFields instanceof HTMLElement)) return;
    nodes.formFields.replaceChildren();
    const groups = new Map();
    schema.forEach((field) => {
      const section = field?.section || 'persoa';
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section).push(field);
    });
    groups.forEach((fields, section) => {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'form-group';
      const legend = document.createElement('legend');
      legend.textContent = sectionTitle(section);
      const grid = document.createElement('div');
      grid.className = 'form-grid';
      fields.forEach((field) => grid.append(createField(field, person?.[field.key] ?? (field.type === 'boolean' ? false : ''))));
      fieldset.append(legend, grid);
      nodes.formFields.append(fieldset);
    });
  }

  function collectFormData() {
    const out = {};
    nodes.formFields?.querySelectorAll('[data-field-key]').forEach((input) => {
      const key = input.dataset.fieldKey;
      if (!key) return;
      out[key] = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : String(input.value ?? '').trim();
    });
    return out;
  }

  function resetFormPhoto() {
    if (formPhotoUrl) { URL.revokeObjectURL(formPhotoUrl); formPhotoUrl = ''; }
    if (nodes.formPhoto instanceof HTMLInputElement) nodes.formPhoto.value = '';
    if (nodes.formPhotoPreview instanceof HTMLImageElement) { nodes.formPhotoPreview.hidden = true; nodes.formPhotoPreview.removeAttribute('src'); }
    if (nodes.formPhotoEmpty instanceof HTMLElement) nodes.formPhotoEmpty.hidden = false;
  }

  async function useExistingPhotoInForm(person) {
    resetFormPhoto();
    const id = keyOf(person);
    if (!id || !person?.fotoR2?.key) return;
    try {
      const blob = await requestPhoto('descargar', id, true);
      if (!(nodes.personDialog instanceof HTMLDialogElement) || !nodes.personDialog.open) return;
      formPhotoUrl = URL.createObjectURL(blob);
      if (nodes.formPhotoPreview instanceof HTMLImageElement) { nodes.formPhotoPreview.src = formPhotoUrl; nodes.formPhotoPreview.hidden = false; }
      if (nodes.formPhotoEmpty instanceof HTMLElement) nodes.formPhotoEmpty.hidden = true;
    } catch {}
  }

  function openPersonDialog(mode) {
    if (!(nodes.personDialog instanceof HTMLDialogElement)) return;
    formMode = mode;
    const person = mode === 'edit' ? selected : null;
    if (nodes.personTitle instanceof HTMLElement) nodes.personTitle.textContent = mode === 'edit' ? `Editar · ${person?.nomeCompleto || ''}` : 'Alta de persoa';
    renderFormFields(person);
    renderLegalCard(nodes.legalData, legal?.datosPersoa);
    renderLegalCard(nodes.legalFee, legal?.exencionCota);
    resetFormPhoto();
    nodes.personDialog.showModal();
    if (person) void useExistingPhotoInForm(person);
  }

  async function loadPeople(preserveId = '', force = false) {
    if (nodes.loading instanceof HTMLElement) nodes.loading.hidden = false;
    if (nodes.error instanceof HTMLElement) nodes.error.hidden = true;
    try {
      const result = await requestV2('listar', { force });
      people = Array.isArray(result?.persoas) ? result.persoas : [];
      schema = Array.isArray(result?.schema?.fields) ? result.schema.fields : [];
      legal = result?.textosLegais && typeof result.textosLegais === 'object' ? result.textosLegais : {};
      permission = result?.permiso || null;
      if (nodes.email instanceof HTMLElement) nodes.email.textContent = auth.currentUser?.email || result?.perfil?.email || '—';
      applyPermissions();
      updateMetrics();
      refreshVoiceFilter();
      renderOptions(preserveId);
      if (preserveId && nodes.select instanceof HTMLSelectElement) {
        nodes.select.value = preserveId;
        selected = people.find((item) => keyOf(item) === preserveId) || null;
        drawPerson();
      }
      if (nodes.loading instanceof HTMLElement) nodes.loading.hidden = true;
      if (nodes.app instanceof HTMLElement) nodes.app.hidden = false;
    } catch (error) {
      showError(error);
    }
  }

  async function savePerson(event) {
    event.preventDefault();
    if (!canWrite()) return;
    const data = collectFormData();
    const nameField = schema.find((field) => field?.key === 'nome');
    const firstField = schema.find((field) => field?.key === 'primeiroApelido');
    if (nameField?.required && !clean(data.nome)) { notify('O nome é obrigatorio.', 'error'); return; }
    if (firstField?.required && !clean(data.primeiroApelido)) { notify('O primeiro apelido é obrigatorio.', 'error'); return; }

    const button = nodes.savePerson;
    const old = button instanceof HTMLButtonElement ? button.textContent : '';
    if (button instanceof HTMLButtonElement) { button.disabled = true; button.textContent = 'Gardando…'; }
    try {
      const currentId = formMode === 'edit' ? keyOf(selected) : '';
      const result = await requestV2(formMode === 'edit' ? 'actualizar' : 'crear', { idPersoa: currentId, persoa: data });
      const id = clean(result?.idPersoa || currentId);
      const file = nodes.formPhoto instanceof HTMLInputElement ? nodes.formPhoto.files?.[0] : null;
      if (file && id) await uploadPhoto(id, file);
      if (nodes.personDialog instanceof HTMLDialogElement) nodes.personDialog.close();
      notify(file ? 'Datos e fotografía gardados.' : 'Datos gardados.');
      await loadPeople(id, false);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Non foi posible gardar a persoa.', 'error');
    } finally {
      if (button instanceof HTMLButtonElement) { button.disabled = false; button.textContent = old || 'Gardar'; }
    }
  }

  async function togglePerson() {
    if (!selected || !canWrite()) return;
    const active = selected?.activo !== true;
    if (!window.confirm(`Queres ${active ? 'reactivar' : 'dar de baixa'} a ${selected?.nomeCompleto || 'esta persoa'}?\n\nO rexistro e a súa ficha conservaranse.`)) return;
    const id = keyOf(selected);
    try {
      await requestV2('estado', { idPersoa: id, activo: active });
      notify(active ? 'Persoa reactivada.' : 'Baixa rexistrada.');
      await loadPeople(id, false);
    } catch (error) { notify(error instanceof Error ? error.message : 'Non foi posible modificar o estado.', 'error'); }
  }

  async function openFile() {
    const id = keyOf(selected);
    if (!id) return;
    const tab = window.open('', '_blank');
    if (!tab) { notify('O navegador bloqueou a nova lapela.', 'error'); return; }
    tab.opener = null;
    try {
      const blob = await requestV2('ficha', { idPersoa: id }, true);
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      fileUrl = URL.createObjectURL(blob);
      tab.location.replace(fileUrl);
    } catch (error) {
      tab.close();
      notify(error instanceof Error ? error.message : 'Non foi posible abrir a ficha.', 'error');
    }
  }

  async function openAcceptance() {
    const id = keyOf(selected);
    if (!id) return;
    const tab = window.open('', '_blank');
    if (!tab) { notify('O navegador bloqueou a nova lapela.', 'error'); return; }
    tab.opener = null;
    try {
      const blob = await requestReview('obterAceptacion', { idPersoa: id }, true);
      if (acceptanceUrl) URL.revokeObjectURL(acceptanceUrl);
      acceptanceUrl = URL.createObjectURL(blob);
      tab.location.replace(acceptanceUrl);
    } catch (error) {
      tab.close();
      notify(error instanceof Error ? error.message : 'Non foi posible abrir a aceptación.', 'error');
    }
  }

  async function generateReview() {
    if (!selected || selected?.activo !== true || !canWrite()) return;
    const button = nodes.review;
    const old = button instanceof HTMLButtonElement ? button.textContent : '';
    if (button instanceof HTMLButtonElement) { button.disabled = true; button.textContent = 'Xerando…'; }
    try {
      const result = await requestReview('xerarLigazon', { idPersoa: keyOf(selected) });
      if (nodes.reviewName instanceof HTMLElement) nodes.reviewName.textContent = selected?.nomeCompleto || '';
      if (nodes.reviewLink instanceof HTMLInputElement) nodes.reviewLink.value = clean(result?.ligazon);
      if (nodes.reviewExpiry instanceof HTMLElement) nodes.reviewExpiry.textContent = result?.caducaEn ? `Caduca: ${new Date(result.caducaEn).toLocaleString('gl-ES')}` : '';
      if (nodes.reviewState instanceof HTMLElement) nodes.reviewState.textContent = '';
      if (nodes.reviewDialog instanceof HTMLDialogElement) nodes.reviewDialog.showModal();
    } catch (error) { notify(error instanceof Error ? error.message : 'Non foi posible xerar a revisión.', 'error'); }
    finally { if (button instanceof HTMLButtonElement) { button.disabled = !canWrite() || selected?.activo !== true; button.textContent = old || 'Xerar revisión'; } }
  }

  function openDelete() {
    if (!selected || !canAdmin() || !(nodes.deleteDialog instanceof HTMLDialogElement)) return;
    if (nodes.deleteName instanceof HTMLElement) nodes.deleteName.textContent = selected?.nomeCompleto || selected?.etiqueta || '';
    if (nodes.deleteConfirmation instanceof HTMLInputElement) nodes.deleteConfirmation.value = '';
    nodes.deleteDialog.showModal();
  }

  async function confirmDelete(event) {
    event.preventDefault();
    if (!selected || !canAdmin()) return;
    const confirmation = nodes.deleteConfirmation instanceof HTMLInputElement ? nodes.deleteConfirmation.value.trim() : '';
    if (confirmation !== 'ELIMINAR') { notify('Escribe ELIMINAR para confirmar a eliminación.', 'error'); return; }
    const id = keyOf(selected);
    const name = selected?.nomeCompleto || 'Persoa';
    if (nodes.confirmDelete instanceof HTMLButtonElement) nodes.confirmDelete.disabled = true;
    try {
      await requestV2('eliminar', { idPersoa: id, confirmacion: confirmation });
      if (nodes.deleteDialog instanceof HTMLDialogElement) nodes.deleteDialog.close();
      selected = null;
      notify(`${name}: rexistro eliminado.`);
      await loadPeople('', false);
    } catch (error) { notify(error instanceof Error ? error.message : 'Non foi posible eliminar o rexistro.', 'error'); }
    finally { if (nodes.confirmDelete instanceof HTMLButtonElement) nodes.confirmDelete.disabled = false; }
  }

  async function copyReviewLink() {
    if (!(nodes.reviewLink instanceof HTMLInputElement) || !nodes.reviewLink.value) return;
    try { await navigator.clipboard.writeText(nodes.reviewLink.value); }
    catch { nodes.reviewLink.select(); document.execCommand('copy'); }
    if (nodes.reviewState instanceof HTMLElement) nodes.reviewState.textContent = 'Ligazón copiada.';
  }

  function previewChosenPhoto() {
    const file = nodes.formPhoto instanceof HTMLInputElement ? nodes.formPhoto.files?.[0] : null;
    if (!file) return;
    if (formPhotoUrl) URL.revokeObjectURL(formPhotoUrl);
    formPhotoUrl = URL.createObjectURL(file);
    if (nodes.formPhotoPreview instanceof HTMLImageElement) { nodes.formPhotoPreview.src = formPhotoUrl; nodes.formPhotoPreview.hidden = false; }
    if (nodes.formPhotoEmpty instanceof HTMLElement) nodes.formPhotoEmpty.hidden = true;
  }

  nodes.select?.addEventListener('change', drawPerson);
  nodes.search?.addEventListener('input', () => renderOptions());
  nodes.status?.addEventListener('change', () => renderOptions());
  nodes.relation?.addEventListener('change', () => renderOptions());
  nodes.voice?.addEventListener('change', () => renderOptions());
  nodes.create?.addEventListener('click', () => openPersonDialog('create'));
  nodes.edit?.addEventListener('click', () => openPersonDialog('edit'));
  nodes.changePhoto?.addEventListener('click', () => { openPersonDialog('edit'); window.setTimeout(() => nodes.formPhoto?.focus(), 50); });
  nodes.personForm?.addEventListener('submit', savePerson);
  nodes.formPhoto?.addEventListener('change', previewChosenPhoto);
  nodes.toggle?.addEventListener('click', togglePerson);
  nodes.openFile?.addEventListener('click', openFile);
  nodes.openAcceptance?.addEventListener('click', openAcceptance);
  nodes.review?.addEventListener('click', generateReview);
  nodes.remove?.addEventListener('click', openDelete);
  nodes.deleteForm?.addEventListener('submit', confirmDelete);
  nodes.copyReview?.addEventListener('click', copyReviewLink);
  nodes.retry?.addEventListener('click', () => loadPeople('', true));
  nodes.logout?.addEventListener('click', () => closePortalSession());

  const closeDialog = (node) => { if (node instanceof HTMLDialogElement) node.close(); };
  nodes.closePerson?.addEventListener('click', () => closeDialog(nodes.personDialog));
  nodes.cancelPerson?.addEventListener('click', () => closeDialog(nodes.personDialog));
  nodes.closeDelete?.addEventListener('click', () => closeDialog(nodes.deleteDialog));
  nodes.cancelDelete?.addEventListener('click', () => closeDialog(nodes.deleteDialog));
  nodes.closeReviewDialog?.addEventListener('click', () => closeDialog(nodes.reviewDialog));
  nodes.closeReview?.addEventListener('click', () => closeDialog(nodes.reviewDialog));

  window.addEventListener('beforeunload', () => {
    [personPhotoUrl, formPhotoUrl, fileUrl, acceptanceUrl].filter(Boolean).forEach((url) => URL.revokeObjectURL(url));
  });

  waitForPortalUser().then((user) => {
    if (!user?.email) { window.location.href = '/portal/'; return; }
    void loadPeople();
  });
}
