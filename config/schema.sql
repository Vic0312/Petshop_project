-- LEGADO: DDL da versão anterior. O Pataí usa MongoDB e config/schema.js.
-- Este arquivo é mantido apenas como referência da estrutura antiga.
-- MySQL 8+: execute dentro de um banco vazio criado com utf8mb4.
-- A aplicação também cria estas tabelas automaticamente na primeira execução.
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL,
  telefone VARCHAR(24) NOT NULL DEFAULT '',
  tipo VARCHAR(20) NOT NULL DEFAULT 'cliente' CHECK (tipo IN ('cliente', 'admin')),
  criado_em VARCHAR(32) NOT NULL
);
CREATE TABLE IF NOT EXISTS animais (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  usuario_id INTEGER NOT NULL,
  nome VARCHAR(80) NOT NULL,
  especie VARCHAR(20) NOT NULL CHECK (especie IN ('Cachorro', 'Gato', 'Outro')),
  raca VARCHAR(80) NOT NULL,
  porte VARCHAR(20) NOT NULL CHECK (porte IN ('Pequeno', 'Médio', 'Grande')),
  idade INTEGER NOT NULL CHECK (idade >= 0 AND idade <= 40),
  observacoes TEXT NOT NULL,
  foto VARCHAR(30) NOT NULL DEFAULT 'dog',
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
CREATE TABLE IF NOT EXISTS servicos (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT NOT NULL,
  preco DECIMAL(10,2) NOT NULL CHECK (preco > 0),
  duracao INTEGER NOT NULL CHECK (duracao >= 15 AND duracao <= 240),
  icone VARCHAR(24) NOT NULL DEFAULT 'bath',
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
);
CREATE TABLE IF NOT EXISTS horarios (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  dia_semana INTEGER NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
  inicio VARCHAR(5) NOT NULL,
  fim VARCHAR(5) NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  UNIQUE (dia_semana)
);
CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  animal_id INTEGER NOT NULL,
  servico_id INTEGER NOT NULL,
  data VARCHAR(10) NOT NULL,
  horario VARCHAR(5) NOT NULL,
  duracao INTEGER NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'recusado', 'cancelado', 'concluido')),
  observacoes TEXT NOT NULL,
  criado_em VARCHAR(32) NOT NULL,
  FOREIGN KEY (animal_id) REFERENCES animais(id),
  FOREIGN KEY (servico_id) REFERENCES servicos(id),
  INDEX idx_agenda_data (data, horario),
  INDEX idx_agenda_animal (animal_id)
);
CREATE TABLE IF NOT EXISTS atendimentos (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  agendamento_id INTEGER NOT NULL UNIQUE,
  observacoes TEXT NOT NULL,
  concluido_em VARCHAR(32) NOT NULL,
  FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id)
);
