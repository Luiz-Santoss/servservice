import os
import re
import secrets
import time
from contextlib import contextmanager
from functools import wraps

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

load_dotenv()

app = Flask(__name__, static_folder="public", static_url_path="")

app.secret_key = os.getenv("SECRET_KEY")
if not app.secret_key:
    raise RuntimeError("Falta a SECRET_KEY no arquivo .env (veja o passo 2).")

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=60 * 60 * 24 * 7,  # login vale 7 dias
    MAX_CONTENT_LENGTH=4 * 1024 * 1024,  # limite do servidor para qualquer envio
)

MAX_FOTO = 3 * 1024 * 1024
PASTA_FOTOS = os.path.join(app.static_folder, "uploads", "fotos")
os.makedirs(PASTA_FOTOS, exist_ok=True)

LIMITES = {
    "nome": 120,
    "email": 120,
    "whatsapp": 20,
    "bairro": 80,
    "descricao": 1000,
    "instagram": 120,
}
HASH_FALSO = generate_password_hash("hash-falso-para-igualar-o-tempo")
TENTATIVAS = {}  # (ip, email) -> horários de logins errados


# ---------- utilidades ----------
@contextmanager
def banco():
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def login_obrigatorio(f):
    @wraps(f)
    def interno(*args, **kwargs):
        if "uid" not in session:
            return jsonify(erro="Faça login para continuar."), 401
        return f(*args, **kwargs)

    return interno


@app.after_request
def cabecalhos(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@app.errorhandler(413)
def arquivo_grande(_):
    return jsonify(erro="O arquivo enviado é grande demais."), 413


def local_texto(cidade, bairro):
    return f"{cidade or 'Sergipe'} - SE" + (f" ({bairro})" if bairro else "")


def whats_link(w):
    return "55" + re.sub(r"\D", "", w or "")


def limpar(dados, campos):
    return {c: str(dados.get(c) or "").strip() for c in campos}


def erro_campos(d, obrigatorios):
    for c in obrigatorios:
        if not d.get(c):
            return f"Preencha o campo: {c}."
    for c, limite in LIMITES.items():
        if c in d and len(d[c]) > limite:
            return f"O campo {c} aceita no máximo {limite} caracteres."
    if "email" in d and not re.match(r"[^@\s]+@[^@\s]+\.[^@\s]+$", d["email"]):
        return "E-mail inválido."
    if "whatsapp" in d and len(re.sub(r"\D", "", d["whatsapp"])) not in (10, 11):
        return "WhatsApp inválido. Use o DDD e o número."
    return None


def id_cidade(cur, nome):
    cur.execute("SELECT id FROM cidade WHERE nome = %s", (nome,))
    linha = cur.fetchone()
    return linha["id"] if linha else None  # "Outra" fica sem cidade


def extensao_imagem(b):
    """Descobre o tipo pelo conteúdo do arquivo, não pelo nome."""
    if b[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return ".webp"
    return None


SQL_PROF = """
    SELECT u.id, u.nome, u.whatsapp, u.bairro, c.nome AS cidade,
           cat.slug AS cat, t.descricao, t.instagram, t.foto
    FROM trabalhadora t
    JOIN usuario u     ON u.id = t.id_usuario
    JOIN categoria cat ON cat.id = t.id_categoria
    LEFT JOIN cidade c ON c.id = u.id_cidade
"""


def prof_json(l):
    return {
        "id": l["id"],
        "nome": l["nome"],
        "cat": l["cat"],
        "cidade": l["cidade"] or "",
        "local": local_texto(l["cidade"], l["bairro"]),
        "desc": l["descricao"],
        "instagram": l["instagram"] or "",
        "foto": l["foto"] or "",
        "whats": whats_link(l["whatsapp"]),
    }


# ---------- páginas ----------
@app.route("/")
def inicio():
    return send_from_directory("public", "index.html")


# ---------- catálogo ----------
@app.get("/api/profissionais")
def listar_profissionais():
    with banco() as cur:
        cur.execute(SQL_PROF + " ORDER BY u.nome")
        return jsonify([prof_json(l) for l in cur.fetchall()])


@app.get("/api/profissionais/<int:id_prof>")
def ver_profissional(id_prof):
    with banco() as cur:
        cur.execute(SQL_PROF + " WHERE u.id = %s", (id_prof,))
        l = cur.fetchone()
    if not l:
        return jsonify(erro="Profissional não encontrada."), 404
    return jsonify(prof_json(l))


@app.get("/api/destaques")
def destaques():
    # primeiro as marcadas como destaque, depois as mais recentes
    with banco() as cur:
        cur.execute(SQL_PROF + " ORDER BY t.destaque DESC, u.criado_em DESC LIMIT 3")
        return jsonify([prof_json(l) for l in cur.fetchall()])


@app.get("/api/estatisticas")
def estatisticas():
    with banco() as cur:
        cur.execute("SELECT COUNT(*) AS n FROM trabalhadora")
        mulheres = cur.fetchone()["n"]
        cur.execute("""
            SELECT COUNT(DISTINCT u.id_cidade) AS n
            FROM usuario u JOIN trabalhadora t ON t.id_usuario = u.id
            WHERE u.id_cidade IS NOT NULL
        """)
        cidades = cur.fetchone()["n"]
    return jsonify(mulheres=mulheres, cidades=cidades)


# ---------- cadastro ----------
def cadastrar(tipo):
    bruto = request.get_json(silent=True) or {}
    prof = tipo == "trabalhadora"
    campos = ["nome", "email", "whatsapp", "cidade", "bairro"]
    obrigatorios = ["nome", "email", "whatsapp", "cidade"]
    if prof:
        campos += ["categoria", "descricao", "instagram"]
        obrigatorios += ["categoria", "descricao"]
    d = limpar(bruto, campos)
    d["email"] = d["email"].lower()
    senha = str(bruto.get("senha") or "")

    erro = erro_campos(d, obrigatorios)
    if not erro and len(senha) < 6:
        erro = "A senha precisa ter pelo menos 6 caracteres."
    if erro:
        return jsonify(erro=erro), 400

    try:
        with banco() as cur:
            id_cat = None
            if prof:
                cur.execute(
                    "SELECT id FROM categoria WHERE slug = %s", (d["categoria"],)
                )
                cat = cur.fetchone()
                if not cat:
                    return jsonify(erro="Categoria inválida."), 400
                id_cat = cat["id"]
            cur.execute(
                """INSERT INTO usuario (nome, email, whatsapp, senha_hash, id_cidade, bairro, tipo)
                   VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (
                    d["nome"],
                    d["email"],
                    d["whatsapp"],
                    generate_password_hash(senha),
                    id_cidade(cur, d["cidade"]),
                    d["bairro"] or None,
                    tipo,
                ),
            )
            novo = cur.fetchone()["id"]
            if prof:
                cur.execute(
                    """INSERT INTO trabalhadora (id_usuario, id_categoria, descricao, instagram)
                       VALUES (%s,%s,%s,%s)""",
                    (novo, id_cat, d["descricao"], d["instagram"] or None),
                )
    except psycopg2.errors.UniqueViolation:
        return jsonify(erro="Este e-mail já está cadastrado."), 409
    return jsonify(ok=True), 201


@app.post("/api/clientes")
def cadastrar_cliente():
    return cadastrar("cliente")


@app.post("/api/trabalhadoras")
def cadastrar_trabalhadora():
    return cadastrar("trabalhadora")


# ---------- login ----------
def bloqueado(chave):
    agora = time.time()
    recentes = [t for t in TENTATIVAS.get(chave, []) if agora - t < 300]
    TENTATIVAS[chave] = recentes
    return len(recentes) >= 5


@app.post("/api/login")
def login():
    d = request.get_json(silent=True) or {}
    email = str(d.get("email") or "").strip().lower()
    senha = str(d.get("senha") or "")
    chave = (request.remote_addr, email)
    if bloqueado(chave):
        return jsonify(erro="Muitas tentativas. Espere 5 minutos e tente de novo."), 429

    with banco() as cur:
        cur.execute(
            "SELECT id, nome, tipo, senha_hash FROM usuario WHERE email = %s", (email,)
        )
        u = cur.fetchone()
    # confere a senha mesmo se o e-mail não existir (o tempo de resposta fica igual)
    senha_ok = check_password_hash(u["senha_hash"] if u else HASH_FALSO, senha)
    if not u or not senha_ok:
        TENTATIVAS.setdefault(chave, []).append(time.time())
        return jsonify(erro="E-mail ou senha incorretos."), 401

    TENTATIVAS.pop(chave, None)
    session.clear()
    session.permanent = True
    session["uid"], session["nome"], session["tipo"] = u["id"], u["nome"], u["tipo"]
    return jsonify(ok=True, tipo=u["tipo"])


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/eu")
def quem_sou_eu():
    if "uid" not in session:
        return jsonify(logado=False)
    return jsonify(
        logado=True, id=session["uid"], nome=session["nome"], tipo=session["tipo"]
    )


# ---------- minha conta ----------
@app.get("/api/minha-conta")
@login_obrigatorio
def ver_conta():
    with banco() as cur:
        cur.execute(
            """
            SELECT u.id, u.nome, u.email, u.whatsapp, u.bairro, u.tipo, c.nome AS cidade,
                   cat.slug AS categoria, t.descricao, t.instagram, t.foto
            FROM usuario u
            LEFT JOIN cidade c       ON c.id = u.id_cidade
            LEFT JOIN trabalhadora t ON t.id_usuario = u.id
            LEFT JOIN categoria cat  ON cat.id = t.id_categoria
            WHERE u.id = %s
        """,
            (session["uid"],),
        )
        l = cur.fetchone()
    if not l:
        session.clear()
        return jsonify(erro="Conta não encontrada."), 404
    return jsonify({k: (v if v is not None else "") for k, v in l.items()})


@app.put("/api/minha-conta")
@login_obrigatorio
def salvar_conta():
    bruto = request.get_json(silent=True) or {}
    prof = session["tipo"] == "trabalhadora"
    campos = ["nome", "whatsapp", "cidade", "bairro"]
    obrigatorios = ["nome", "whatsapp", "cidade"]
    if prof:
        campos += ["categoria", "descricao", "instagram"]
        obrigatorios += ["categoria", "descricao"]
    d = limpar(bruto, campos)
    erro = erro_campos(d, obrigatorios)
    if erro:
        return jsonify(erro=erro), 400

    with banco() as cur:
        id_cat = None
        if prof:
            cur.execute("SELECT id FROM categoria WHERE slug = %s", (d["categoria"],))
            cat = cur.fetchone()
            if not cat:
                return jsonify(erro="Categoria inválida."), 400
            id_cat = cat["id"]
        cur.execute(
            "UPDATE usuario SET nome=%s, whatsapp=%s, id_cidade=%s, bairro=%s WHERE id=%s",
            (
                d["nome"],
                d["whatsapp"],
                id_cidade(cur, d["cidade"]),
                d["bairro"] or None,
                session["uid"],
            ),
        )
        if prof:
            cur.execute(
                """UPDATE trabalhadora SET id_categoria=%s, descricao=%s, instagram=%s
                   WHERE id_usuario=%s""",
                (id_cat, d["descricao"], d["instagram"] or None, session["uid"]),
            )
    session["nome"] = d["nome"]
    return jsonify(ok=True)


@app.post("/api/minha-conta/foto")
@login_obrigatorio
def enviar_foto():
    if session["tipo"] != "trabalhadora":
        return jsonify(erro="Só profissionais têm foto de perfil."), 403
    arq = request.files.get("foto")
    if not arq:
        return jsonify(erro="Nenhuma foto enviada."), 400
    dados = arq.read(MAX_FOTO + 1)
    if len(dados) > MAX_FOTO:
        return jsonify(erro="A foto pode ter no máximo 3 MB."), 413
    ext = extensao_imagem(dados)
    if not ext:
        return jsonify(erro="Use uma imagem JPG, PNG ou WEBP."), 400

    nome = (
        secrets.token_hex(16) + ext
    )  # nome aleatório: ninguém controla o nome do arquivo
    with open(os.path.join(PASTA_FOTOS, nome), "wb") as f:
        f.write(dados)
    url = "/uploads/fotos/" + nome

    with banco() as cur:
        cur.execute(
            "SELECT foto FROM trabalhadora WHERE id_usuario = %s", (session["uid"],)
        )
        antiga = cur.fetchone()
        cur.execute(
            "UPDATE trabalhadora SET foto = %s WHERE id_usuario = %s",
            (url, session["uid"]),
        )
    if antiga and antiga["foto"] and antiga["foto"].startswith("/uploads/fotos/"):
        caminho = os.path.join(PASTA_FOTOS, os.path.basename(antiga["foto"]))
        if os.path.isfile(caminho):
            os.remove(caminho)
    return jsonify(foto=url)


# ---------- favoritas ----------
@app.get("/api/favoritos")
@login_obrigatorio
def listar_favoritos():
    with banco() as cur:
        cur.execute(
            "SELECT id_trabalhadora FROM favorita WHERE id_usuario = %s",
            (session["uid"],),
        )
        return jsonify([l["id_trabalhadora"] for l in cur.fetchall()])


@app.post("/api/favoritos/importar")
@login_obrigatorio
def importar_favoritos():
    bruto = (request.get_json(silent=True) or {}).get("ids")
    ids = [i for i in (bruto if isinstance(bruto, list) else []) if isinstance(i, int)][
        :200
    ]
    if ids:
        with banco() as cur:
            cur.execute(
                """INSERT INTO favorita (id_usuario, id_trabalhadora)
                   SELECT %s, id_usuario FROM trabalhadora WHERE id_usuario = ANY(%s)
                   ON CONFLICT DO NOTHING""",
                (session["uid"], ids),
            )
    return jsonify(ok=True)


@app.post("/api/favoritos/<int:id_prof>")
@login_obrigatorio
def favoritar(id_prof):
    with banco() as cur:
        cur.execute("SELECT 1 FROM trabalhadora WHERE id_usuario = %s", (id_prof,))
        if not cur.fetchone():
            return jsonify(erro="Profissional não encontrada."), 404
        cur.execute(
            """INSERT INTO favorita (id_usuario, id_trabalhadora) VALUES (%s,%s)
               ON CONFLICT DO NOTHING""",
            (session["uid"], id_prof),
        )
    return jsonify(ok=True)


@app.delete("/api/favoritos/<int:id_prof>")
@login_obrigatorio
def desfavoritar(id_prof):
    with banco() as cur:
        cur.execute(
            "DELETE FROM favorita WHERE id_usuario = %s AND id_trabalhadora = %s",
            (session["uid"], id_prof),
        )
    return jsonify(ok=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
