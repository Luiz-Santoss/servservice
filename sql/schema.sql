-- ConectaServ - esquema PostgreSQL (baseado no DER do artigo)
CREATE TABLE cidade (id SERIAL PRIMARY KEY, nome VARCHAR(80) UNIQUE NOT NULL);
CREATE TABLE categoria (id SERIAL PRIMARY KEY, slug VARCHAR(30) UNIQUE NOT NULL, nome VARCHAR(60) NOT NULL);

CREATE TABLE usuario (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(120) UNIQUE NOT NULL,
  whatsapp VARCHAR(20) NOT NULL,
  senha_hash TEXT NOT NULL,              -- nunca guardar senha em texto puro
  id_cidade INT REFERENCES cidade(id),
  bairro VARCHAR(80),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('cliente','trabalhadora')),
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE trabalhadora (
  id_usuario INT PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
  id_categoria INT NOT NULL REFERENCES categoria(id),
  descricao TEXT NOT NULL,
  instagram VARCHAR(120)
);

CREATE TABLE favorito (
  id_cliente INT REFERENCES usuario(id) ON DELETE CASCADE,
  id_trabalhadora INT REFERENCES trabalhadora(id_usuario) ON DELETE CASCADE,
  PRIMARY KEY (id_cliente, id_trabalhadora)
);

CREATE TABLE avaliacao (                 -- mural de depoimentos
  id SERIAL PRIMARY KEY,
  id_cliente INT REFERENCES usuario(id),
  id_trabalhadora INT REFERENCES trabalhadora(id_usuario),
  nota SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

INSERT INTO categoria (slug, nome) VALUES
 ('artesanato','Artesanato'),('gastronomia','Gastronomia e Festas'),('estetica','Beleza e Estética'),
 ('gerais','Serviços Gerais'),('aulas','Aulas e Reforço'),('cuidados','Cuidado com Pessoas e Pets');
INSERT INTO cidade (nome) VALUES ('Aracaju'),('Nossa Senhora do Socorro'),('Lagarto'),('Itabaiana'),('Estância'),('São Cristóvão');