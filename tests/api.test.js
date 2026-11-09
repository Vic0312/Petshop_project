import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createDatabase } from '../config/database.js';
import { seedDatabase } from '../config/seed.js';
import { createApp } from '../server.js';
import { today, shiftDate } from '../utils/dates.js';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { objectId } from '../utils/mongo.js';
import { AgendamentoModel } from '../models/agendamentoModel.js';
import sharp from 'sharp';
import { access, readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { isUploadedPhoto } from '../utils/photoStorage.js';

describe('Pataí: regras de negócio e acesso da API', () => {
  const databaseName = `patai_test_${randomUUID().replaceAll('-', '')}`;
  const missingId = '000000000000000000000001';
  const uploadsDirectory = fileURLToPath(new URL(`../.tmp/patai_uploads_test_${randomUUID()}/`, import.meta.url));
  let db, server, base, cliente, admin, outro, pet, booking, date, services, foreignAppointment, pendingAppointment, photoPet, photoBuffer;
  function agent() {
    let cookie = '';
    return async (path, method = 'GET', body, headers = {}) => {
      const multipart = body instanceof FormData;
      const response = await fetch(base + path, { method, headers: { ...(!multipart ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}) });
      const fresh = response.headers.get('set-cookie');
      if (fresh) cookie = fresh.split(';')[0];
      const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
      return { status: response.status, data, headers: response.headers };
    };
  }
  before(async () => {
    db = await createDatabase({ name: databaseName });
    await seedDatabase(db, true);
    server = createApp(db, { demo: true, secure: false, uploadsDirectory }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}/api`;
    cliente = agent(); admin = agent(); outro = agent();
    assert.equal((await cliente('/auth/login', 'POST', { email: 'cliente@patai.com.br', senha: 'Patai@123' })).status, 200);
    assert.equal((await admin('/auth/login', 'POST', { email: 'admin@patai.com.br', senha: 'Patai@123' })).status, 200);
    const registered = await outro('/auth/cadastro', 'POST', { nome: 'Outro tutor', email: 'outro@example.test', senha: 'SenhaForte123', tipo: 'admin' });
    assert.equal(registered.status, 201);
    date = shiftDate(today(), 21);
    while (new Date(`${date}T12:00:00Z`).getUTCDay() === 0) date = shiftDate(date, 1);
    const dashboard = (await cliente('/dashboard')).data;
    pet = dashboard.animais[0];
    services = Object.fromEntries(dashboard.servicos.map(service => [service.nome, service]));
    foreignAppointment = dashboard.agendamentos[0].id;
    pendingAppointment = dashboard.agendamentos.find(item => item.status === 'pendente').id;
    photoBuffer = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#dec7a6' } }).png().toBuffer();
  });
  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    // O nome é criado por este teste. Nunca aponta para o banco do aplicativo.
    assert.match(databaseName, /^patai_test_[a-f0-9]{32}$/);
    const cleanup = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
    try { await cleanup.connect(); await cleanup.db(databaseName).dropDatabase(); }
    finally { await cleanup.close(); }
    const files = await readdir(uploadsDirectory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const file of files) { assert.ok(isUploadedPhoto(file)); await unlink(join(uploadsDirectory, file)); }
    await rmdir(uploadsDirectory).catch(error => { if (error.code !== 'ENOENT') throw error; });
  });

  it('exige login para dados privados e oferece serviços públicos', async () => {
    const anonymous = agent();
    assert.equal((await anonymous('/dashboard')).status, 401);
    assert.equal((await anonymous('/config')).data.demo, true);
    assert.equal((await anonymous('/servicos')).data.length, 4);
    assert.equal((await cliente('/rota-inexistente')).status, 404);
  });
  it('rejeita credenciais incorretas e nunca devolve a senha', async () => {
    assert.equal((await agent()('/auth/login', 'POST', { email: 'cliente@patai.com.br', senha: 'incorreta' })).status, 401);
    const result = await cliente('/auth/me');
    assert.equal(result.status, 200);
    assert.equal(result.data.senha, undefined);
    assert.equal((await outro('/auth/me')).data.tipo, 'cliente');
  });
  it('valida e-mail, senha e duplicação do cadastro', async () => {
    const request = agent();
    assert.equal((await request('/auth/cadastro', 'POST', { nome: 'Tutor', email: 'ruim', senha: '12345678' })).status, 400);
    assert.equal((await request('/auth/cadastro', 'POST', { nome: 'Tutor', email: 'novo@example.test', senha: '123' })).status, 400);
    assert.equal((await request('/auth/cadastro', 'POST', { nome: 'Tutor', email: 'CLIENTE@patai.com.br', senha: '12345678' })).status, 409);
  });
  it('impede escalada de perfil e edição de serviços pelo cliente', async () => {
    assert.equal((await cliente('/servicos', 'POST', {})).status, 403);
    assert.equal((await cliente('/horarios', 'PUT', {})).status, 403);
  });
  it('isola animais e agendamentos por tutor', async () => {
    const result = await outro('/dashboard');
    assert.deepEqual(result.data.animais, []);
    assert.deepEqual(result.data.agendamentos, []);
    assert.deepEqual(result.data.clientes, []);
    assert.equal((await outro(`/animais/${pet.id}`, 'PUT', pet)).status, 404);
    assert.equal((await outro(`/agendamentos/${foreignAppointment}/status`, 'PATCH', { status: 'cancelado' })).status, 404);
  });
  it('cadastra e edita animais com validação de idade e espécie', async () => {
    const input = { nome: 'Amora', especie: 'Gato', raca: 'Sem raça definida', porte: 'Pequeno', idade: 1, observacoes: 'Sensível a ruídos.' };
    assert.equal((await outro('/animais', 'POST', { ...input, idade: -1 })).status, 400);
    assert.equal((await outro('/animais', 'POST', { ...input, especie: 'inválida' })).status, 400);
    const created = await outro('/animais', 'POST', input);
    assert.equal(created.status, 201);
    assert.equal(created.data.foto, 'cat');
    assert.equal((await outro(`/animais/${created.data.id}`, 'PUT', { ...input, idade: 2 })).data.idade, 2);
  });
  it('valida datas, horários, dia fechado e propriedade do animal', async () => {
    const serviceId = services['Banho completo'].id;
    assert.equal((await cliente(`/disponibilidade?data=2026-02-30&servico_id=${serviceId}`)).status, 400);
    assert.equal((await cliente(`/disponibilidade?data=${shiftDate(today(), -1)}&servico_id=${serviceId}`)).status, 400);
    assert.equal((await cliente(`/disponibilidade?data=${date}&servico_id=${missingId}`)).status, 404);
    let sunday = date; while (new Date(`${sunday}T12:00:00Z`).getUTCDay() !== 0) sunday = shiftDate(sunday, 1);
    assert.deepEqual((await cliente(`/disponibilidade?data=${sunday}&servico_id=${serviceId}`)).data, []);
    assert.equal((await outro('/agendamentos', 'POST', { animal_id: pet.id, servico_id: serviceId, data: date, horario: '09:00' })).status, 403);
  });
  it('reserva atomicamente e bloqueia pedidos simultâneos e sobreposição', async () => {
    const input = { animal_id: pet.id, servico_id: services['Banho e tosa'].id, data: date, horario: '09:00' };
    const results = await Promise.all([cliente('/agendamentos', 'POST', input), cliente('/agendamentos', 'POST', input)]);
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    booking = results.find(r => r.status === 201).data;
    assert.equal(booking.status, 'pendente');
    assert.equal(Number(booking.valor), 110);
    assert.equal((await cliente('/agendamentos', 'POST', { ...input, horario: '09:30' })).status, 409);
    const slots = (await cliente(`/disponibilidade?data=${date}&servico_id=${services['Banho completo'].id}`)).data;
    assert.ok(!slots.includes('09:00') && !slots.includes('09:30') && !slots.includes('10:00'));
    assert.ok(slots.includes('10:30'));
  });
  it('preserva valor e duração históricos após editar o serviço', async () => {
    const service = services['Banho e tosa'];
    assert.equal((await admin(`/servicos/${service.id}`, 'PUT', { ...service, preco: 125, duracao: 120 })).status, 200);
    const result = await db.collection('agendamentos').findOne({ _id: objectId(booking.id) });
    assert.equal(Number(result.valor), 110); assert.equal(result.duracao, 90);
  });
  it('restringe aprovação ao administrador e conclusão ao horário do atendimento', async () => {
    assert.equal((await cliente(`/agendamentos/${booking.id}/status`, 'PATCH', { status: 'confirmado' })).status, 403);
    assert.equal((await admin(`/agendamentos/${booking.id}/status`, 'PATCH', { status: 'confirmado' })).data.status, 'confirmado');
    assert.equal((await admin(`/agendamentos/${booking.id}/status`, 'PATCH', { status: 'concluido' })).status, 400);
    assert.equal((await admin(`/agendamentos/${booking.id}/status`, 'PATCH', { status: 'recusado' })).status, 409);
  });
  it('protege agendamentos ao alterar horários de funcionamento', async () => {
    const rows = (await admin('/dashboard')).data.horarios;
    assert.equal((await admin('/horarios', 'PUT', { horarios: rows.slice(1) })).status, 400);
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    assert.equal((await admin('/horarios', 'PUT', { horarios: rows.map(row => row.dia_semana === day ? { ...row, ativo: 0 } : row) })).status, 409);
    assert.equal((await admin('/horarios', 'PUT', { horarios: rows })).status, 200);
  });
  it('libera o horário após cancelamento e impede nova transição terminal', async () => {
    assert.equal((await cliente(`/agendamentos/${booking.id}/status`, 'PATCH', { status: 'cancelado' })).status, 200);
    assert.equal((await cliente(`/agendamentos/${booking.id}/status`, 'PATCH', { status: 'cancelado' })).status, 409);
    assert.ok((await cliente(`/disponibilidade?data=${date}&servico_id=${services['Banho completo'].id}`)).data.includes('09:00'));
  });
  it('registra atendimento e status atomicamente no mesmo documento, sem duplicar', async () => {
    const result = await db.collection('agendamentos').insertOne({ animal_id: objectId(pet.id), servico_id: objectId(services['Banho completo'].id), data: shiftDate(today(), -1), horario: '09:00', duracao: 60, valor: 65, status: 'confirmado', observacoes: '', criado_em: new Date().toISOString() });
    const id = result.insertedId.toHexString();
    const responses = await Promise.all([admin(`/agendamentos/${id}/status`, 'PATCH', { status: 'concluido', observacoes: 'Pelagem hidratada. Ficou tranquilo.' }), admin(`/agendamentos/${id}/status`, 'PATCH', { status: 'concluido' })]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    assert.equal(await db.collection('agendamentos').countDocuments({ _id: result.insertedId, status: 'concluido', atendimento: { $exists: true } }), 1);
    const dashboard = (await cliente('/dashboard')).data;
    assert.equal(dashboard.agendamentos.find(a => a.id === id).atendimento_observacoes, 'Pelagem hidratada. Ficou tranquilo.');
  });
  it('permite recusa e inativação de serviços sem apagar o histórico', async () => {
    const service = services['Hidratação'];
    assert.equal((await admin(`/servicos/${service.id}`, 'PUT', { ...service, ativo: 0 })).status, 200);
    assert.ok(!(await cliente('/dashboard')).data.servicos.some(s => s.id === service.id));
    assert.equal((await cliente(`/disponibilidade?data=${date}&servico_id=${service.id}`)).status, 404);
    assert.equal((await admin(`/agendamentos/${pendingAppointment}/status`, 'PATCH', { status: 'recusado' })).data.status, 'recusado');
    assert.equal((await admin(`/agendamentos/${pendingAppointment}/status`, 'PATCH', { status: 'confirmado' })).status, 409);
  });
  it('impede sobreposição pelo índice único mesmo com duas conexões independentes', async () => {
    const second = await createDatabase({ name: databaseName });
    try {
      const left = new AgendamentoModel(db), right = new AgendamentoModel(second);
      const input = { animal_id: pet.id, servico_id: services['Banho completo'].id, data: shiftDate(date, 21), horario: '09:00', duracao: 60, valor: 65, observacoes: '' };
      const results = await Promise.allSettled([left.create(input), right.create({ ...input, horario: '09:30' })]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
    } finally { await second.close(); }
  });
  it('valida documentos no MongoDB e mantém o seed idempotente', async () => {
    await assert.rejects(db.collection('animais').insertOne({ nome: 'Sem tutor' }), error => error.code === 121);
    const before = await db.collection('usuarios').countDocuments();
    await seedDatabase(db, true);
    assert.equal(await db.collection('usuarios').countDocuments(), before);
  });
  function animalForm(file = photoBuffer, type = 'image/png', name = 'meu-animal.png', changes = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries({ nome: 'Pipoca', especie: 'Cachorro', raca: 'Sem raça definida', porte: 'Pequeno', idade: 2, observacoes: '', ...changes })) form.append(key, String(value));
    if (file) form.append('foto', new Blob([file], { type }), name);
    return form;
  }
  it('cadastra animal com foto real, converte para WebP e limita dimensões', async () => {
    const result = await cliente('/animais', 'POST', animalForm(photoBuffer, 'image/png', '../../meu-animal.png'));
    assert.equal(result.status, 201);
    photoPet = result.data;
    assert.ok(isUploadedPhoto(photoPet.foto));
    const stored = await readFile(join(uploadsDirectory, photoPet.foto));
    const metadata = await sharp(stored).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 675);
    assert.equal(metadata.exif, undefined);
    assert.equal((await cliente('/dashboard')).data.animais.find(p => p.id === photoPet.id).foto, photoPet.foto);
  });
  it('aceita formulário com foto na rota com barra final e preserva JSON nas demais rotas', async () => {
    const created = await cliente('/animais/', 'POST', animalForm());
    assert.equal(created.status, 201);
    assert.ok(isUploadedPhoto(created.data.foto));
    const updated = await cliente(`/animais/${created.data.id}/`, 'PUT', animalForm());
    assert.equal(updated.status, 200);
    assert.ok(isUploadedPhoto(updated.data.foto));
    const invalidProfile = await cliente('/auth/perfil', 'PUT', animalForm());
    assert.equal(invalidProfile.status, 415);
    assert.match(invalidProfile.data.message, /JSON/);
  });
  it('protege a leitura da foto pelo tutor ou administrador', async () => {
    const path = `/animais/fotos/${photoPet.foto}`;
    const response = await cliente(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/webp/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal((await admin(path)).status, 200);
    assert.equal((await outro(path)).status, 404);
    assert.equal((await agent()(path)).status, 401);
  });
  it('preserva a foto ao editar os dados e a usa nos agendamentos', async () => {
    const updated = await cliente(`/animais/${photoPet.id}`, 'PUT', { ...photoPet, nome: 'Pipoca atualizada' });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.foto, photoPet.foto);
    const created = await db.collection('agendamentos').insertOne({ animal_id: objectId(photoPet.id), servico_id: objectId(services['Banho completo'].id), data: shiftDate(today(), -3), horario: '10:00', duracao: 60, valor: 65, status: 'cancelado', observacoes: '', criado_em: new Date().toISOString() });
    const dashboard = (await cliente('/dashboard')).data;
    assert.equal(dashboard.agendamentos.find(a => a.id === created.insertedId.toHexString()).foto, photoPet.foto);
  });
  it('troca e remove a foto sem manter arquivos antigos', async () => {
    const previous = photoPet.foto;
    const updated = await cliente(`/animais/${photoPet.id}`, 'PUT', animalForm());
    assert.equal(updated.status, 200);
    assert.notEqual(updated.data.foto, previous);
    await assert.rejects(access(join(uploadsDirectory, previous)), error => error.code === 'ENOENT');
    assert.equal((await cliente(`/animais/fotos/${previous}`)).status, 404);
    const newPhoto = updated.data.foto;
    const removed = await cliente(`/animais/${photoPet.id}`, 'PUT', animalForm(null, 'image/png', '', { remover_foto: true }));
    assert.equal(removed.status, 200);
    assert.equal(removed.data.foto, 'dog');
    await assert.rejects(access(join(uploadsDirectory, newPhoto)), error => error.code === 'ENOENT');
    assert.equal((await cliente(`/animais/fotos/${newPhoto}`)).status, 404);
  });
  it('recusa arquivos inválidos e maiores que 5 MB sem criar cadastros ou arquivos', async () => {
    const count = await db.collection('animais').countDocuments();
    const files = await readdir(uploadsDirectory);
    assert.equal((await cliente('/animais', 'POST', animalForm(Buffer.from('<svg></svg>'), 'image/svg+xml', 'foto.svg'))).status, 400);
    assert.equal((await cliente('/animais', 'POST', animalForm(Buffer.from('arquivo sem imagem'), 'image/png', 'foto.png'))).status, 400);
    const tooLarge = await cliente('/animais', 'POST', animalForm(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/jpeg', 'foto.jpg'));
    assert.equal(tooLarge.status, 400);
    assert.match(tooLarge.data.message, /5 MB/);
    assert.equal(await db.collection('animais').countDocuments(), count);
    assert.deepEqual(await readdir(uploadsDirectory), files);
  });
  it('impede upload para outro tutor, origem externa e campos inválidos', async () => {
    const files = await readdir(uploadsDirectory);
    assert.equal((await outro(`/animais/${photoPet.id}`, 'PUT', animalForm())).status, 404);
    assert.equal((await admin('/animais', 'POST', animalForm())).status, 403);
    assert.equal((await agent()('/animais', 'POST', animalForm())).status, 401);
    assert.equal((await cliente('/animais', 'POST', animalForm(), { Origin: 'https://outro-site.example' })).status, 403);
    assert.equal((await cliente('/animais', 'POST', animalForm(photoBuffer, 'image/png', 'foto.png', { idade: -2 }))).status, 400);
    assert.deepEqual(await readdir(uploadsDirectory), files);
  });
  it('bloqueia solicitações de outra origem e invalida sessão no logout', async () => {
    assert.equal((await cliente('/auth/perfil', 'PUT', { nome: 'Mariana Costa', telefone: '' }, { Origin: 'https://outro-site.example' })).status, 403);
    assert.equal((await outro('/auth/perfil', 'PUT', { nome: 'Novo nome', telefone: '(11) 99999-8888' })).data.nome, 'Novo nome');
    assert.equal((await outro('/auth/logout', 'POST', {})).status, 200);
    assert.equal((await outro('/dashboard')).status, 401);
  });
});
