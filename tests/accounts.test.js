import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { createDatabase } from '../config/database.js';
import { seedDatabase } from '../config/seed.js';
import { createApp } from '../server.js';
import { objectId } from '../utils/mongo.js';
import { verifyPassword } from '../utils/password.js';

describe('Pataí: perfil, credenciais e cadastro administrativo', () => {
  const name = `patai_test_${randomUUID().replaceAll('-', '')}`;
  const initialPassword = 'Inicial@123';
  let db, server, base, admin, client;
  function agent() {
    let cookie = '';
    return async (path, method = 'GET', body) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      const changed = response.headers.get('set-cookie');
      if (changed) cookie = changed.split(';')[0];
      return { status: response.status, data: await response.json() };
    };
  }
  const login = (request, email, senha = initialPassword) => request('/auth/login', 'POST', { email, senha });
  async function createUser(tipo = 'cliente', changes = {}) {
    const input = { nome: 'Conta de teste', email: `${randomUUID()}@example.test`, telefone: '(11) 99999-8888', tipo, senha: initialPassword, confirmacao_senha: initialPassword, ...changes };
    const result = await admin('/usuarios', 'POST', input);
    assert.equal(result.status, 201, result.data.message);
    const request = agent();
    assert.equal((await login(request, result.data.email, input.senha)).status, 200);
    return { user: result.data, request, input };
  }
  before(async () => {
    db = await createDatabase({ name });
    await seedDatabase(db, true);
    server = createApp(db, { demo: true, secure: false }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}/api`;
    admin = agent(); client = agent();
    assert.equal((await login(admin, 'admin@patai.com.br', 'Patai@123')).status, 200);
    assert.equal((await login(client, 'cliente@patai.com.br', 'Patai@123')).status, 200);
  });
  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    assert.match(name, /^patai_test_[a-f0-9]{32}$/);
    const cleanup = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
    try { await cleanup.connect(); await cleanup.db(name).dropDatabase(); }
    finally { await cleanup.close(); }
  });

  it('restringe a listagem e o cadastro de usuários à administração', async () => {
    assert.equal((await agent()('/usuarios')).status, 401);
    assert.equal((await client('/usuarios')).status, 403);
    assert.equal((await client('/usuarios', 'POST', { tipo: 'admin' })).status, 403);
    assert.deepEqual((await client('/dashboard')).data.usuarios, []);
    const list = await admin('/usuarios');
    assert.equal(list.status, 200);
    assert.ok(list.data.some(u => u.tipo === 'admin'));
    assert.ok(list.data.every(u => u.senha === undefined));
  });
  it('permite cadastrar os dois perfis sem trocar a sessão do administrador', async () => {
    const currentId = (await admin('/auth/me')).data.id;
    const customer = await createUser('cliente');
    const manager = await createUser('admin');
    assert.equal(customer.user.tipo, 'cliente');
    assert.equal(manager.user.tipo, 'admin');
    assert.equal(customer.user.senha, undefined);
    assert.equal(manager.user.senha, undefined);
    assert.equal((await admin('/auth/me')).data.id, currentId);
    assert.equal((await customer.request('/usuarios')).status, 403);
    assert.equal((await manager.request('/usuarios')).status, 200);
    assert.ok((await admin('/dashboard')).data.clientes.some(u => u.id === customer.user.id));
    const stored = await db.collection('usuarios').findOne({ _id: objectId(manager.user.id) });
    assert.notEqual(stored.senha, initialPassword);
    assert.equal(await verifyPassword(initialPassword, stored.senha), true);
  });
  it('valida os dados do novo usuário e impede e-mails duplicados', async () => {
    const count = await db.collection('usuarios').countDocuments();
    const valid = { nome: 'Novo usuário', email: 'novo@example.test', telefone: '', tipo: 'cliente', senha: initialPassword, confirmacao_senha: initialPassword };
    for (const changes of [{ tipo: 'superadmin' }, { email: 'invalido' }, { senha: '123', confirmacao_senha: '123' }, { confirmacao_senha: 'diferente' }, { telefone: '123' }]) {
      assert.equal((await admin('/usuarios', 'POST', { ...valid, ...changes })).status, 400);
    }
    assert.equal((await admin('/usuarios', 'POST', { ...valid, email: 'ADMIN@PATAI.COM.BR' })).status, 409);
    assert.equal(await db.collection('usuarios').countDocuments(), count);
  });
  it('permite aos dois perfis mudar e-mail com senha atual e encerra outras sessões', async () => {
    for (const tipo of ['cliente', 'admin']) {
      const account = await createUser(tipo);
      const anotherSession = agent();
      assert.equal((await login(anotherSession, account.user.email)).status, 200);
      const email = `${randomUUID()}@example.test`;
      const result = await account.request('/auth/perfil', 'PUT', { ...account.user, email: email.toUpperCase(), senha_atual: initialPassword });
      assert.equal(result.status, 200);
      assert.equal(result.data.email, email);
      assert.equal(result.data.id, account.user.id);
      assert.equal(result.data.tipo, tipo);
      assert.equal(result.data.senha, undefined);
      assert.equal((await account.request('/auth/me')).status, 200);
      assert.equal((await anotherSession('/auth/me')).status, 401);
      assert.equal((await login(agent(), account.user.email)).status, 401);
      assert.equal((await login(agent(), email)).status, 200);
    }
  });
  it('rejeita e-mail inválido, duplicado ou alteração sem a senha correta', async () => {
    const { user, request } = await createUser();
    const changed = { ...user, email: 'alterado@example.test' };
    assert.equal((await request('/auth/perfil', 'PUT', changed)).status, 400);
    assert.equal((await request('/auth/perfil', 'PUT', { ...changed, senha_atual: 'errada' })).status, 400);
    assert.equal((await request('/auth/perfil', 'PUT', { ...user, email: 'admin@patai.com.br', senha_atual: initialPassword })).status, 409);
    assert.equal((await request('/auth/perfil', 'PUT', { ...user, email: 'invalido', senha_atual: initialPassword })).status, 400);
    assert.equal((await request('/auth/me')).data.email, user.email);
  });
  it('permite aos dois perfis trocar a senha, mantém o acesso atual e invalida o anterior', async () => {
    for (const tipo of ['cliente', 'admin']) {
      const account = await createUser(tipo);
      const anotherSession = agent();
      assert.equal((await login(anotherSession, account.user.email)).status, 200);
      const password = 'Nova senha @123';
      const result = await account.request('/auth/perfil', 'PUT', { ...account.user, senha_atual: initialPassword, nova_senha: password, confirmacao_senha: password });
      assert.equal(result.status, 200);
      assert.equal(result.data.tipo, tipo);
      assert.equal(result.data.senha, undefined);
      assert.equal((await account.request('/auth/me')).status, 200);
      assert.equal((await anotherSession('/auth/me')).status, 401);
      assert.equal((await login(agent(), account.user.email)).status, 401);
      assert.equal((await login(agent(), account.user.email, password)).status, 200);
      const stored = await db.collection('usuarios').findOne({ _id: objectId(account.user.id) });
      assert.equal(await verifyPassword(password, stored.senha), true);
    }
  });
  it('valida a confirmação e a senha atual sem modificar uma senha válida', async () => {
    const { user, request } = await createUser();
    const base = { ...user, senha_atual: initialPassword, nova_senha: 'OutraSenha@123', confirmacao_senha: 'OutraSenha@123' };
    for (const changes of [{ senha_atual: 'errada' }, { senha_atual: '' }, { nova_senha: '123', confirmacao_senha: '123' }, { confirmacao_senha: 'diferente' }]) {
      assert.equal((await request('/auth/perfil', 'PUT', { ...base, ...changes })).status, 400);
    }
    assert.equal((await login(agent(), user.email)).status, 200);
    assert.equal((await request('/auth/me')).status, 200);
  });
  it('impede mudança de perfil ou edição de outra conta pelos campos enviados', async () => {
    const { user, request } = await createUser();
    const adminId = (await admin('/auth/me')).data.id;
    const result = await request('/auth/perfil', 'PUT', { ...user, id: adminId, tipo: 'admin', nome: 'Novo nome', senha: 'SenhaIgnorada@123' });
    assert.equal(result.status, 200);
    assert.equal(result.data.id, user.id);
    assert.equal(result.data.tipo, 'cliente');
    assert.notEqual((await admin('/auth/me')).data.nome, 'Novo nome');
  });
  it('preserva a unicidade do e-mail em atualizações concorrentes', async () => {
    const first = await createUser(), second = await createUser();
    const email = `${randomUUID()}@example.test`;
    const responses = await Promise.all([first, second].map(account => account.request('/auth/perfil', 'PUT', { ...account.user, email, senha_atual: initialPassword })));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    assert.equal(await db.collection('usuarios').countDocuments({ email }), 1);
  });
  it('não recria contas de demonstração depois de alterar seus e-mails', async () => {
    const before = await db.collection('usuarios').countDocuments();
    await db.collection('usuarios').updateOne({ email: 'cliente@patai.com.br' }, { $set: { email: 'cliente-renomeado@example.test' } });
    await db.collection('usuarios').updateOne({ email: 'admin@patai.com.br' }, { $set: { email: 'admin-renomeado@example.test' } });
    await seedDatabase(db, true);
    assert.equal(await db.collection('usuarios').countDocuments(), before);
    assert.equal(await db.collection('usuarios').findOne({ email: 'cliente@patai.com.br' }), null);
    assert.equal(await db.collection('usuarios').findOne({ email: 'admin@patai.com.br' }), null);
  });
});
