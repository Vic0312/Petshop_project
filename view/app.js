import { createApp, ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from '/vendor/vue.js';
import { Icon } from './icons.js';

createApp({
  components: { Icon },
  setup() {
    const user = ref(null), booting = ref(true), busy = ref(false);
    const data = reactive({ animais: [], servicos: [], agendamentos: [], horarios: [], clientes: [], usuarios: [] });
    const page = ref('inicio'), sidebarOpen = ref(false), search = ref(''), notificationsOpen = ref(false);
    const registering = ref(false), showPassword = ref(false), authError = ref(''), formError = ref(''), loadError = ref('');
    const authForm = reactive({ nome: '', email: '', senha: '', telefone: '' });
    const profileForm = reactive({ nome: '', email: '', telefone: '', senha_atual: '', nova_senha: '', confirmacao_senha: '' });
    const userForm = reactive({ nome: '', email: '', telefone: '', tipo: 'cliente', senha: '', confirmacao_senha: '' });
    const userFilter = ref('todos'), passwordExpanded = ref(false);
    const credentialsChanged = computed(() => profileForm.email.trim().toLowerCase() !== user.value?.email || Boolean(profileForm.nova_senha || profileForm.confirmacao_senha));
    const animalForm = reactive({}), serviceForm = reactive({}), hoursForm = ref([]);
    const animalPhotoInput = ref(null), animalPhotoFile = ref(null), animalPhotoPreview = ref(''), animalPhotoError = ref('');
    const isUploadedAnimalPhoto = computed(() => /^[a-f0-9-]{36}\.webp$/.test(animalForm.foto || '') && !animalForm.remover_foto);
    const animalPhotoSource = computed(() => animalPhotoPreview.value || (modal.value?.type === 'animal' && modal.value.item && !animalForm.remover_foto ? petImage(animalForm.foto) : ''));
    const dialogElement = ref(null), modal = ref(null), toast = ref(null);
    const bookingStep = ref(1), slots = ref([]), slotsLoading = ref(false), slotsError = ref('');
    const bookingForm = reactive({ animal_id: null, servico_id: null, data: '', horario: '', observacoes: '' });
    const completionNotes = ref(''), appointmentFilter = ref('todos'), dateFilter = ref(''), selectedDate = ref('');
    const now = ref(new Date());
    const today = computed(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now.value));
    const maxDate = computed(() => shiftDate(today.value, 180));
    const calendarMonth = ref(new Date(`${today.value}T12:00:00`));
    let toastTimer, tickTimer, slotSequence = 0;
    const isAdmin = computed(() => user.value?.tipo === 'admin');
    const firstName = computed(() => user.value?.nome.split(' ')[0] || '');
    const navigation = computed(() => isAdmin.value ? [
      { id: 'inicio', label: 'Visão geral', icon: 'home' }, { id: 'agenda', label: 'Agenda', icon: 'calendar' },
      { id: 'solicitacoes', label: 'Solicitações', icon: 'clipboard' }, { id: 'clientes', label: 'Clientes e animais', icon: 'users' },
      { id: 'usuarios', label: 'Usuários', icon: 'shield' },
      { id: 'servicos', label: 'Serviços', icon: 'scissors' }, { id: 'horarios', label: 'Horários', icon: 'clock' }, { id: 'atendimentos', label: 'Atendimentos', icon: 'heart' },
    ] : [{ id: 'inicio', label: 'Visão geral', icon: 'home' }, { id: 'animais', label: 'Meus animais', icon: 'paw' }, { id: 'servicos', label: 'Serviços', icon: 'scissors' }, { id: 'agendamentos', label: 'Meus agendamentos', icon: 'calendar' }]);
    const pageTitle = computed(() => page.value === 'perfil' ? 'Meu perfil' : navigation.value.find(item => item.id === page.value)?.label || 'Visão geral');
    const weekdayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const todayLabel = computed(() => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(now.value));
    const greeting = computed(() => { const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(now.value)); return hour < 12 ? 'BOM DIA, COM CARINHO' : hour < 18 ? 'BOA TARDE, COM CARINHO' : 'BOA NOITE, COM CARINHO'; });
    const activeServices = computed(() => data.servicos.filter(item => item.ativo));
    const pending = computed(() => data.agendamentos.filter(item => item.status === 'pendente'));
    const upcoming = computed(() => data.agendamentos.filter(item => ['pendente', 'confirmado'].includes(item.status) && !hasStarted(item)).sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario)));
    const notifications = computed(() => isAdmin.value ? pending.value : upcoming.value);
    const stats = computed(() => isAdmin.value ? [
      { label: 'Cuidados de hoje', value: data.agendamentos.filter(a => a.data === today.value && ['pendente', 'confirmado', 'concluido'].includes(a.status)).length, icon: 'calendar', color: 'green', note: 'na nossa agenda' },
      { label: 'Aguardando resposta', value: pending.value.length, icon: 'clock', color: 'yellow', note: 'solicitações pendentes' },
      { label: 'Nossa comunidade', value: data.clientes.length, icon: 'users', color: 'sage', note: 'tutores de muito amor' },
      { label: 'Cuidados realizados', value: data.agendamentos.filter(a => a.status === 'concluido').length, icon: 'heart', color: 'peach', note: 'histórias de carinho' },
    ] : [
      { label: 'Meus companheiros', value: data.animais.length, icon: 'paw', color: 'green', note: 'amores cadastrados' },
      { label: 'Próximos cuidados', value: upcoming.value.length, icon: 'calendar', color: 'yellow', note: 'momentos de bem-estar' },
      { label: 'Carinhos recebidos', value: data.agendamentos.filter(a => a.status === 'concluido').length, icon: 'heart', color: 'sage', note: 'cuidados realizados' },
    ]);
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const matches = (...values) => normalize(values.join(' ')).includes(normalize(search.value.trim()));
    const filteredPets = computed(() => data.animais.filter(p => matches(p.nome, p.raca, p.especie)));
    const filteredServices = computed(() => data.servicos.filter(s => matches(s.nome, s.descricao)));
    const filteredClients = computed(() => data.clientes.filter(c => matches(c.nome, c.email, ...data.animais.filter(p => p.usuario_id === c.id).map(p => p.nome))));
    const filteredUsers = computed(() => data.usuarios.filter(u => (userFilter.value === 'todos' || u.tipo === userFilter.value) && matches(u.nome, u.email, u.telefone, u.tipo === 'admin' ? 'Administrador' : 'Cliente')));
    const userFilters = computed(() => [
      { value: 'todos', label: 'Todos', count: data.usuarios.length },
      { value: 'admin', label: 'Administradores', count: data.usuarios.filter(u => u.tipo === 'admin').length },
      { value: 'cliente', label: 'Clientes', count: data.usuarios.filter(u => u.tipo === 'cliente').length },
    ]);
    const appointmentFilters = [{ label: 'Todos', value: 'todos' }, { label: 'Confirmados', value: 'confirmado' }, { label: 'Pendentes', value: 'pendente' }, { label: 'Concluídos', value: 'concluido' }, { label: 'Cancelados', value: 'cancelado' }];
    const filteredAppointments = computed(() => data.agendamentos.filter(a =>
      (page.value !== 'solicitacoes' || a.status === 'pendente') && (page.value !== 'atendimentos' || a.status === 'concluido') &&
      (['solicitacoes', 'atendimentos'].includes(page.value) || appointmentFilter.value === 'todos' || (appointmentFilter.value === 'cancelado' ? ['cancelado', 'recusado'].includes(a.status) : a.status === appointmentFilter.value)) &&
      (!dateFilter.value || a.data === dateFilter.value) && matches(a.animal_nome, a.servico_nome, a.tutor)
    ).sort((a, b) => ['agenda', 'solicitacoes'].includes(page.value) ? (a.data + a.horario).localeCompare(b.data + b.horario) : (b.data + b.horario).localeCompare(a.data + a.horario)));
    const searchResults = computed(() => {
      if (!search.value.trim()) return [];
      return [
        ...filteredPets.value.map(p => ({ key: `pet-${p.id}`, title: p.nome, subtitle: p.raca, icon: 'paw', type: 'pet', item: p })),
        ...filteredServices.value.map(s => ({ key: `service-${s.id}`, title: s.nome, subtitle: money(s.preco), icon: s.icone, type: 'service', item: s })),
        ...(isAdmin.value ? filteredUsers.value.map(u => ({ key: `user-${u.id}`, title: u.nome, subtitle: u.email, icon: 'user', type: 'user', item: u })) : []),
        ...data.agendamentos.filter(a => matches(a.animal_nome, a.servico_nome, a.tutor)).map(a => ({ key: `appointment-${a.id}`, title: `${a.animal_nome} · ${a.servico_nome}`, subtitle: `${shortDate(a.data)} às ${a.horario}`, icon: 'calendar', type: 'appointment', item: a })),
      ].slice(0, 7);
    });
    const calendarLabel = computed(() => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calendarMonth.value));
    const calendarDays = computed(() => {
      const year = calendarMonth.value.getFullYear(), month = calendarMonth.value.getMonth();
      const first = new Date(year, month, 1).getDay(), count = new Date(year, month + 1, 0).getDate();
      return [...Array(first).fill(null), ...Array.from({ length: count }, (_, index) => {
        const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
        return { number: index + 1, date, events: data.agendamentos.some(a => a.data === date && ['pendente', 'confirmado'].includes(a.status)) };
      })];
    });
    const selectedPet = computed(() => data.animais.find(p => p.id === bookingForm.animal_id));
    const selectedService = computed(() => data.servicos.find(s => s.id === bookingForm.servico_id));
    const modalEyebrow = computed(() => ({ animal: 'AMOR QUE TEM NOME', service: 'BEM-ESTAR EM CADA DETALHE', usuario: 'QUEM FAZ PARTE DO PATAÍ', booking: 'UM ENCONTRO COM O CARINHO', details: 'SEU ENCONTRO COM O CARINHO', status: 'CUIDADO COM CADA DETALHE', help: 'A GENTE ESTÁ POR AQUI' })[modal.value?.type] || '');
    const modalTitle = computed(() => ({ animal: modal.value?.item ? 'Um carinho nos detalhes.' : 'Mais um amor na família.', service: modal.value?.item ? 'Editar um cuidado' : 'Um novo cuidado', usuario: 'Cadastrar usuário', booking: 'Vamos marcar um carinho?', details: 'Os detalhes do nosso encontro.', status: modal.value?.status === 'concluido' ? 'Mais um pet feliz.' : modal.value?.status === 'recusado' ? 'Recusar solicitação?' : 'Os planos mudaram?', help: 'Conte com o Pataí.' })[modal.value?.type] || '');

    function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
    function initials(name) { return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase(); }
    function dateObject(date) { return new Date(`${date}T12:00:00`); }
    function shortDate(date) { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(dateObject(date)); }
    function dateTime(date) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date)); }
    function dayNumber(date) { return date.slice(8); }
    function monthShort(date) { return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(dateObject(date)).replace('.', '').toUpperCase(); }
    function shiftDate(date, days) { const value = dateObject(date); value.setDate(value.getDate() + days); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
    function hasStarted(appointment) { return new Date(`${appointment.data}T${appointment.horario}:00-03:00`).valueOf() <= now.value.valueOf(); }
    function statusLabel(status) { return ({ pendente: 'Pendente', confirmado: 'Confirmado', recusado: 'Recusado', cancelado: 'Cancelado', concluido: 'Concluído' })[status] || status; }
    function petImage(photo) {
      if (typeof photo === 'string' && /^[a-f0-9-]{36}\.webp$/.test(photo)) return `/api/animais/fotos/${photo}`;
      return `/assets/images/${['golden', 'cat', 'dog'].includes(photo) ? photo : 'dog'}.jpg`;
    }
    function notify(message, error = false) { clearTimeout(toastTimer); toast.value = { message, error }; toastTimer = setTimeout(() => { toast.value = null; }, 5500); }
    function navigate(target) { window.location.hash = target; sidebarOpen.value = false; notificationsOpen.value = false; search.value = ''; }
    function syncRoute() {
      const route = window.location.hash.slice(1);
      page.value = [...navigation.value.map(item => item.id), 'perfil'].includes(route) ? route : 'inicio';
      document.title = `${pageTitle.value} · Pataí`;
      notificationsOpen.value = false;
      sidebarOpen.value = false;
      window.scrollTo(0, 0);
    }
    async function api(path, options = {}) {
      const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers } });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401 && user.value && !path.includes('/auth/login')) { user.value = null; closeModal(true); notify('Sua sessão terminou. Entre novamente para continuar.', true); }
        throw new Error(result.message || 'Não foi possível concluir a operação.');
      }
      return result;
    }
    const send = (path, method, body) => api(path, { method, body: body instanceof FormData ? body : JSON.stringify(body) });
    async function loadDashboard() {
      try {
        const result = await api('/dashboard');
        user.value = result.user;
        for (const key of ['animais', 'servicos', 'agendamentos', 'horarios', 'clientes', 'usuarios']) data[key] = result[key] || [];
        hoursForm.value = result.horarios.map(row => ({ ...row, ativo: Boolean(row.ativo) }));
        resetProfile(result.user);
        loadError.value = '';
        return true;
      } catch (error) { loadError.value = error.message; return false; }
    }
    async function submitAuth() {
      if (busy.value) return;
      busy.value = true; authError.value = '';
      try {
        user.value = await send(registering.value ? '/auth/cadastro' : '/auth/login', 'POST', authForm);
        authForm.senha = '';
        await loadDashboard();
        syncRoute();
      } catch (error) { authError.value = error.message; }
      finally { busy.value = false; }
    }
    async function logout() {
      if (busy.value) return;
      busy.value = true;
      try { await send('/auth/logout', 'POST', {}); user.value = null; for (const key of Object.keys(data)) data[key] = []; authForm.senha = ''; search.value = ''; closeModal(true); navigate('inicio'); notify('Até o próximo carinho. ♡'); }
      catch (error) { notify(error.message, true); }
      finally { busy.value = false; }
    }
    function openAnimal(pet) {
      resetAnimalPhoto();
      formError.value = '';
      Object.assign(animalForm, pet ? { ...pet } : { nome: '', especie: 'Cachorro', raca: '', porte: 'Pequeno', idade: 0, observacoes: '', foto: 'dog' });
      animalForm.remover_foto = false;
      modal.value = { type: 'animal', item: pet || null };
    }
    function resetAnimalPhoto() {
      if (animalPhotoPreview.value) URL.revokeObjectURL(animalPhotoPreview.value);
      animalPhotoPreview.value = ''; animalPhotoFile.value = null; animalPhotoError.value = '';
      if (animalPhotoInput.value) animalPhotoInput.value.value = '';
    }
    function selectAnimalPhoto(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { animalPhotoError.value = 'Escolha uma foto JPG, PNG ou WebP.'; event.target.value = ''; return; }
      if (file.size > 5 * 1024 * 1024) { animalPhotoError.value = 'A foto deve ter no máximo 5 MB.'; event.target.value = ''; return; }
      if (animalPhotoPreview.value) URL.revokeObjectURL(animalPhotoPreview.value);
      animalPhotoFile.value = file;
      animalPhotoPreview.value = URL.createObjectURL(file);
      animalPhotoError.value = ''; formError.value = ''; animalForm.remover_foto = false;
    }
    function removeAnimalPhoto() { resetAnimalPhoto(); animalForm.remover_foto = true; }
    function onAnimalPhotoError() {
      if (!animalPhotoFile.value) return;
      resetAnimalPhoto();
      animalPhotoError.value = 'Não foi possível abrir essa foto. Escolha outra imagem.';
    }
    function openService(service) {
      formError.value = '';
      Object.assign(serviceForm, service ? { ...service } : { nome: '', descricao: '', preco: 65, duracao: 60, icone: 'bath', ativo: 1 });
      modal.value = { type: 'service', item: service || null };
    }
    function openUser() {
      if (!isAdmin.value) return;
      Object.assign(userForm, { nome: '', email: '', telefone: '', tipo: 'cliente', senha: '', confirmacao_senha: '' });
      formError.value = '';
      modal.value = { type: 'usuario' };
    }
    function openBooking(serviceId = null, animalId = null) {
      if (isAdmin.value) return;
      bookingStep.value = 1; formError.value = ''; slotsError.value = ''; slots.value = [];
      Object.assign(bookingForm, { animal_id: animalId || data.animais[0]?.id || null, servico_id: typeof serviceId === 'string' ? serviceId : activeServices.value[0]?.id || null, data: shiftDate(today.value, 1), horario: '', observacoes: '' });
      modal.value = { type: 'booking' };
    }
    function openDetails(appointment) { formError.value = ''; modal.value = { type: 'details', item: appointment }; }
    function openStatus(status) { formError.value = ''; completionNotes.value = ''; modal.value = { type: 'status', item: modal.value.item, status }; }
    function openHelp() { modal.value = { type: 'help' }; }
    function closeModal(force = false) { if (busy.value && force !== true) return; modal.value = null; slotSequence++; }
    function onDialogClick(event) { if (event.target === dialogElement.value) { const rect = dialogElement.value.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal(); } }
    async function mutate(path, method, body, success, after) {
      if (busy.value) return;
      busy.value = true; formError.value = '';
      try { await send(path, method, body); await loadDashboard(); closeModal(true); notify(success); if (after) after(); }
      catch (error) { formError.value = error.message; }
      finally { busy.value = false; }
    }
    function saveAnimal() {
      if (animalPhotoError.value) return;
      const item = modal.value.item, payload = new FormData();
      for (const key of ['nome', 'especie', 'raca', 'porte', 'idade', 'observacoes']) payload.append(key, String(animalForm[key] ?? ''));
      payload.append('remover_foto', String(Boolean(animalForm.remover_foto)));
      if (animalPhotoFile.value) payload.append('foto', animalPhotoFile.value);
      return mutate(`/animais${item ? '/' + item.id : ''}`, item ? 'PUT' : 'POST', payload, item ? 'Os detalhes do seu companheiro estão atualizados.' : `${animalForm.nome} já faz parte da família Pataí!`, () => { if (!item) navigate('animais'); });
    }
    function saveService() { const item = modal.value.item; return mutate(`/servicos${item ? '/' + item.id : ''}`, item ? 'PUT' : 'POST', serviceForm, item ? 'Serviço atualizado com carinho.' : 'Um novo cuidado já está disponível.'); }
    function saveUser() {
      if (userForm.senha !== userForm.confirmacao_senha) { formError.value = 'A confirmação deve ser igual à senha inicial.'; return; }
      return mutate('/usuarios', 'POST', userForm, userForm.tipo === 'admin' ? 'Novo administrador cadastrado.' : 'Novo cliente cadastrado.', () => { userFilter.value = 'todos'; navigate('usuarios'); });
    }
    async function fetchSlots() {
      const sequence = ++slotSequence;
      bookingForm.horario = ''; slotsError.value = ''; slots.value = [];
      if (!bookingForm.data || !bookingForm.servico_id) return;
      slotsLoading.value = true;
      try { const result = await api(`/disponibilidade?data=${encodeURIComponent(bookingForm.data)}&servico_id=${bookingForm.servico_id}`); if (sequence === slotSequence) slots.value = result; }
      catch (error) { if (sequence === slotSequence) slotsError.value = error.message; }
      finally { if (sequence === slotSequence) slotsLoading.value = false; }
    }
    async function advanceBooking() {
      formError.value = '';
      if (bookingStep.value === 1) { if (!selectedPet.value || !selectedService.value) { formError.value = 'Escolha seu companheiro e um cuidado.'; return; } bookingStep.value = 2; await fetchSlots(); }
      else if (bookingStep.value === 2) { if (!bookingForm.horario || !slots.value.includes(bookingForm.horario)) { formError.value = 'Escolha um horário disponível para continuar.'; return; } bookingStep.value = 3; }
      else await mutate('/agendamentos', 'POST', bookingForm, 'Carinho solicitado! Agora é só aguardar a confirmação.', () => { appointmentFilter.value = 'todos'; dateFilter.value = ''; navigate('agendamentos'); });
    }
    function changeStatus(appointment, status) { return mutate(`/agendamentos/${appointment.id}/status`, 'PATCH', { status, observacoes: completionNotes.value }, ({ confirmado: 'Solicitação confirmada. Um carinho está a caminho!', recusado: 'Solicitação recusada e horário liberado.', cancelado: 'Agendamento cancelado. Nos vemos em um próximo carinho.', concluido: 'Atendimento registrado. Mais um pet feliz!' })[status]); }
    function saveHours() { return mutate('/horarios', 'PUT', { horarios: hoursForm.value }, 'Horários atualizados. Tudo pronto para receber mais carinho.'); }
    async function saveProfile() {
      if (busy.value) return; busy.value = true; formError.value = '';
      try {
        if (profileForm.nova_senha !== profileForm.confirmacao_senha) throw new Error('A confirmação deve ser igual à nova senha.');
        user.value = await send('/auth/perfil', 'PUT', profileForm);
        resetProfile(user.value);
        if (isAdmin.value) { const index = data.usuarios.findIndex(item => item.id === user.value.id); if (index >= 0) data.usuarios[index] = { ...user.value }; }
        notify('Seu perfil está atualizado.');
      }
      catch (error) { formError.value = error.message; }
      finally { busy.value = false; }
    }
    function resetProfile(account) {
      Object.assign(profileForm, { nome: account.nome, email: account.email, telefone: account.telefone, senha_atual: '', nova_senha: '', confirmacao_senha: '' });
      passwordExpanded.value = false;
    }
    function togglePasswordFields() {
      passwordExpanded.value = !passwordExpanded.value;
      if (!passwordExpanded.value) {
        profileForm.nova_senha = ''; profileForm.confirmacao_senha = '';
        if (profileForm.email.trim().toLowerCase() === user.value.email) profileForm.senha_atual = '';
      }
    }
    function changeMonth(delta) { calendarMonth.value = new Date(calendarMonth.value.getFullYear(), calendarMonth.value.getMonth() + delta, 1); }
    function selectCalendarDate(date) { selectedDate.value = date; dateFilter.value = date; appointmentFilter.value = 'todos'; navigate(isAdmin.value ? 'agenda' : 'agendamentos'); }
    function selectSearchResult(result) {
      search.value = '';
      if (result.type === 'appointment') openDetails(result.item);
      else if (result.type === 'service') isAdmin.value ? openService(result.item) : openBooking(result.item.id);
      else if (result.type === 'user') { userFilter.value = 'todos'; navigate('usuarios'); }
      else isAdmin.value ? navigate('clientes') : openAnimal(result.item);
    }
    function keyboard(event) {
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) && !modal.value) { event.preventDefault(); document.querySelector('.global-search input')?.focus(); }
      if (event.key === 'Escape') { notificationsOpen.value = false; sidebarOpen.value = false; search.value = ''; }
    }
    watch(() => [bookingForm.data, bookingForm.servico_id], () => { if (modal.value?.type === 'booking' && bookingStep.value === 2) fetchSlots(); });
    watch(bookingStep, async () => {
      await nextTick();
      if (modal.value?.type === 'booking' && dialogElement.value?.open) {
        dialogElement.value.scrollTop = 0;
        document.getElementById('modal-title')?.focus({ preventScroll: true });
      }
    });
    watch(page, () => { formError.value = ''; search.value = ''; if (user.value) resetProfile(user.value); });
    watch(modal, async value => { if (value?.type !== 'animal') resetAnimalPhoto(); if (value?.type !== 'usuario') { userForm.senha = ''; userForm.confirmacao_senha = ''; } await nextTick(); const dialog = dialogElement.value; if (value && dialog && !dialog.open) { dialog.showModal(); dialog.setAttribute('aria-labelledby', 'modal-title'); } else if (!value && dialog?.open) dialog.close(); document.body.classList.toggle('modal-open', Boolean(value)); });
    onMounted(async () => {
      window.addEventListener('hashchange', syncRoute);
      window.addEventListener('keydown', keyboard);
      tickTimer = setInterval(() => { now.value = new Date(); }, 30000);
      try {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (response.ok) { user.value = await response.json(); await loadDashboard(); syncRoute(); }
        else if (response.status !== 401) authError.value = 'Não foi possível carregar sua conta. Tente entrar novamente.';
      } catch { authError.value = 'Não foi possível conectar ao Pataí. Verifique se o servidor está em execução.'; }
      finally { booting.value = false; }
    });
    onBeforeUnmount(() => { resetAnimalPhoto(); clearTimeout(toastTimer); clearInterval(tickTimer); window.removeEventListener('hashchange', syncRoute); window.removeEventListener('keydown', keyboard); });
    return { userForm, userFilter, userFilters, filteredUsers, passwordExpanded, credentialsChanged, togglePasswordFields, openUser, saveUser, animalPhotoInput, animalPhotoFile, animalPhotoError, animalPhotoSource, isUploadedAnimalPhoto, selectAnimalPhoto, removeAnimalPhoto, onAnimalPhotoError, user, booting, busy, data, page, sidebarOpen, search, notificationsOpen, registering, showPassword, authError, formError, loadError, authForm, profileForm, animalForm, serviceForm, hoursForm, dialogElement, modal, toast, bookingStep, slots, slotsLoading, slotsError, bookingForm, completionNotes, appointmentFilter, dateFilter, selectedDate, today, maxDate, isAdmin, firstName, navigation, pageTitle, weekdayNames, todayLabel, greeting, activeServices, pending, upcoming, notifications, stats, filteredPets, filteredServices, filteredClients, appointmentFilters, filteredAppointments, searchResults, calendarLabel, calendarDays, selectedPet, selectedService, modalEyebrow, modalTitle, money, initials, shortDate, dateTime, dayNumber, monthShort, hasStarted, statusLabel, petImage, navigate, loadDashboard, submitAuth, logout, openAnimal, openService, openBooking, openDetails, openStatus, openHelp, closeModal, onDialogClick, saveAnimal, saveService, fetchSlots, advanceBooking, changeStatus, saveHours, saveProfile, changeMonth, selectCalendarDate, selectSearchResult };
  },
}).mount('#app');
