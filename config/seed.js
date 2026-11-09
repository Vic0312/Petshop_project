import { hashPassword } from '../utils/password.js';
import { shiftDate, today } from '../utils/dates.js';
import { reservationKeys } from '../utils/mongo.js';

export async function seedDatabase(db, demo = process.env.SEED_DEMO !== 'false') {
  const usuarios = db.collection('usuarios'), animais = db.collection('animais'), servicos = db.collection('servicos');
  const horarios = db.collection('horarios'), agendamentos = db.collection('agendamentos');
  const catalog = [
    { nome: 'Banho completo', descricao: 'Um banho de carinho com produtos especiais, secagem e escovação para renovar a alegria do seu pet.', preco: 65, duracao: 60, icone: 'bath', ativo: 1 },
    { nome: 'Banho e tosa', descricao: 'O cuidado completo: banho, secagem e um novo visual, respeitando o jeitinho de cada pet.', preco: 110, duracao: 90, icone: 'scissors', ativo: 1 },
    { nome: 'Tosa higiênica', descricao: 'Mais conforto no dia a dia, com cuidado delicado nas patinhas, barriga e regiões íntimas.', preco: 45, duracao: 30, icone: 'sparkles', ativo: 1 },
    { nome: 'Hidratação', descricao: 'Pelagem macia e brilhante com uma hidratação que nutre e protege. Um carinho a mais.', preco: 40, duracao: 30, icone: 'heart', ativo: 1 },
  ];
  if (!await servicos.findOne()) await servicos.insertMany(catalog);
  for (let day = 0; day <= 6; day++) await horarios.updateOne({ dia_semana: day }, { $setOnInsert: { dia_semana: day, inicio: '09:00', fim: day === 6 ? '14:00' : '18:00', ativo: day === 0 ? 0 : 1 } }, { upsert: true });
  const now = new Date().toISOString();
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && !await usuarios.findOne({ email: process.env.ADMIN_EMAIL.toLowerCase() })) {
    if (process.env.ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD precisa de pelo menos 8 caracteres.');
    await usuarios.insertOne({ nome: process.env.ADMIN_NAME || 'Administrador', email: process.env.ADMIN_EMAIL.toLowerCase(), senha: await hashPassword(process.env.ADMIN_PASSWORD), telefone: '', tipo: 'admin', criado_em: now });
  }
  if (!demo || await usuarios.findOne({ email: 'cliente@patai.com.br' })) return;
  if (!await usuarios.findOne({ email: 'admin@patai.com.br' })) await usuarios.insertOne({ nome: 'Equipe Pataí', email: 'admin@patai.com.br', senha: await hashPassword('Patai@123'), telefone: '(11) 99999-0000', tipo: 'admin', criado_em: now });
  const { insertedId: userId } = await usuarios.insertOne({ nome: 'Mariana Costa', email: 'cliente@patai.com.br', senha: await hashPassword('Patai@123'), telefone: '(11) 98765-4321', tipo: 'cliente', criado_em: now });
  const luna = await animais.insertOne({ usuario_id: userId, nome: 'Luna', especie: 'Cachorro', raca: 'Golden retriever', porte: 'Grande', idade: 3, observacoes: 'Adora carinho e fica mais tranquila com água morna.', foto: 'golden' });
  const milo = await animais.insertOne({ usuario_id: userId, nome: 'Milo', especie: 'Gato', raca: 'Sem raça definida', porte: 'Pequeno', idade: 2, observacoes: 'É um pouco tímido. Manusear com delicadeza.', foto: 'cat' });
  const { insertedId: user2 } = await usuarios.insertOne({ nome: 'Rafael Oliveira', email: 'rafael@patai.com.br', senha: await hashPassword('Patai@123'), telefone: '(11) 97654-3210', tipo: 'cliente', criado_em: now });
  const thor = await animais.insertOne({ usuario_id: user2, nome: 'Thor', especie: 'Cachorro', raca: 'Beagle', porte: 'Médio', idade: 4, observacoes: '', foto: 'dog' });
  const byName = Object.fromEntries((await servicos.find().toArray()).map(service => [service.nome, service]));
  const base = today();
  const nextOpen = offset => { let date = shiftDate(base, offset); while (new Date(`${date}T12:00:00Z`).getUTCDay() === 0) date = shiftDate(date, 1); return date; };
  for (const [animal, serviceName, date, time, status] of [
    [luna.insertedId, 'Banho e tosa', nextOpen(1), '09:00', 'confirmado'],
    [milo.insertedId, 'Banho completo', nextOpen(3), '14:00', 'pendente'],
    [thor.insertedId, 'Tosa higiênica', nextOpen(1), '11:00', 'pendente'],
    [luna.insertedId, 'Banho completo', shiftDate(base, -14), '10:00', 'concluido'],
  ]) {
    const service = byName[serviceName];
    if (!service) continue;
    const appointment = { animal_id: animal, servico_id: service._id, data: date, horario: time, duracao: service.duracao, valor: service.preco, status, observacoes: '', criado_em: now };
    if (status === 'concluido') appointment.atendimento = { observacoes: 'Luna ficou tranquila durante o banho. Pelagem escovada e unhas aparadas.', concluido_em: `${date}T14:00:00.000Z` };
    else appointment.reservas = reservationKeys(date, time, service.duracao);
    await agendamentos.insertOne(appointment);
  }
}
