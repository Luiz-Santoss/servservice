// Catálogo: busca as profissionais na API (Flask + PostgreSQL), com filtros, favoritas (conta ou navegador), WhatsApp e compartilhar
const CATEGORIAS = {
  artesanato: "Artesanato",
  gastronomia: "Gastronomia e Festas",
  estetica: "Beleza e Estética",
  gerais: "Serviços Gerais",
  aulas: "Aulas e Reforço",
  cuidados: "Cuidado com Pessoas e Pets",
};
const ICONES = {
  artesanato: "fa-scroll",
  gastronomia: "fa-cake-candles",
  estetica: "fa-scissors",
  gerais: "fa-broom",
  aulas: "fa-book-open",
  cuidados: "fa-paw",
};

let PROFISSIONAIS = [];
const $ = (s) => document.querySelector(s);
const esc = (t) =>
  String(t ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );

let catAtiva = "",
  soFavoritas = false,
  favoritas = [],
  logado = false;
const lerFavLocal = () => {
  try {
    return JSON.parse(localStorage.getItem("favoritas") || "[]");
  } catch (e) {
    return [];
  }
};
const salvarFavLocal = () => {
  try {
    localStorage.setItem("favoritas", JSON.stringify(favoritas));
  } catch (e) {}
};
const JSON_HDR = { "Content-Type": "application/json" };

// Logada: favoritas ficam na conta. Visitante: ficam no navegador.
async function carregarFavoritas() {
  const a = await window.authPronto;
  logado = !!a.logado;
  const local = lerFavLocal();
  if (!logado) {
    favoritas = local;
    return;
  }
  try {
    if (local.length) {
      await fetch("/api/favoritos/importar", {
        method: "POST",
        headers: JSON_HDR,
        body: JSON.stringify({ ids: local }),
      });
      localStorage.removeItem("favoritas");
    }
    favoritas = await fetch("/api/favoritos").then((r) => r.json());
  } catch (e) {
    favoritas = local;
  }
}

async function alternarFavorita(id) {
  const ja = favoritas.includes(id);
  favoritas = ja ? favoritas.filter((x) => x !== id) : [...favoritas, id];
  if (logado) {
    try {
      await fetch("/api/favoritos/" + id, { method: ja ? "DELETE" : "POST" });
    } catch (e) {}
  } else {
    salvarFavLocal();
  }
}

const norm = (t) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const msgWhats = (p) =>
  encodeURIComponent(
    `Olá, ${p.nome.split(" ")[0]}! Vi seu perfil na plataforma ConectaServ e gostaria de orçar um serviço.`,
  );
const avatar = (p) =>
  p.foto
    ? `<div class="avatar"><img src="${esc(p.foto)}" alt="Foto de ${esc(p.nome)}" loading="lazy"></div>`
    : `<div class="avatar"><i class="fa-solid ${ICONES[p.cat] || "fa-user"}"></i></div>`;

function render() {
  const busca = norm($("#busca").value),
    cidade = $("#filtro-cidade").value;
  const lista = PROFISSIONAIS.filter(
    (p) =>
      (!catAtiva || p.cat === catAtiva) &&
      (!cidade || p.cidade === cidade) &&
      (!soFavoritas || favoritas.includes(p.id)) &&
      (!busca ||
        norm(p.nome + " " + p.desc + " " + (CATEGORIAS[p.cat] || "")).includes(
          busca,
        )),
  );
  $("#contagem").textContent = `${lista.length} profissional(is) encontrada(s)`;
  $("#grid").innerHTML = lista.length
    ? lista
        .map(
          (p) => `
  <article class="card-trabalhadora">
    <div class="card-topo">
      <button class="btn-fav" data-fav="${p.id}" aria-pressed="${favoritas.includes(p.id)}" aria-label="Favoritar ${esc(p.nome)}"><i class="fa-solid fa-heart"></i></button>
      ${avatar(p)}
      <h3 class="nome">${esc(p.nome)}</h3><span class="tag">${esc(CATEGORIAS[p.cat])}</span>
    </div>
    <div class="card-corpo"><div>
      <div class="localizacao"><i class="fa-solid fa-location-dot"></i>${esc(p.local)}</div>
            <p class="descricao">${esc(p.desc)}</p>
      <a class="link-perfil" href="perfil.html?id=${p.id}">Ver perfil completo <i class="fa-solid fa-arrow-right"></i></a></div>
      <div class="card-rodape">
        <a class="btn-contato btn-whatsapp" target="_blank" rel="noopener" href="https://wa.me/${esc(p.whats)}?text=${msgWhats(p)}"><i class="fa-brands fa-whatsapp"></i> Contato direto</a>
        <button class="btn-contato" data-share="${p.id}"><i class="fa-solid fa-share-nodes"></i> Compartilhar</button>
      </div></div>
  </article>`,
        )
        .join("")
    : '<p class="vazio">Nenhuma profissional encontrada com esses filtros.</p>';
}

document.querySelectorAll(".chip[data-cat]").forEach((b) =>
  b.addEventListener("click", () => {
    catAtiva = b.dataset.cat;
    document
      .querySelectorAll(".chip[data-cat]")
      .forEach((x) => x.setAttribute("aria-pressed", x === b));
    render();
  }),
);
$("#chip-fav").addEventListener("click", (e) => {
  soFavoritas = !soFavoritas;
  e.currentTarget.setAttribute("aria-pressed", soFavoritas);
  render();
});
$("#busca").addEventListener("input", render);
$("#filtro-cidade").addEventListener("change", render);

$("#grid").addEventListener("click", async (e) => {
  const f = e.target.closest("[data-fav]");
  if (f) {
    await alternarFavorita(+f.dataset.fav);
    render();
    return;
  }
  const s = e.target.closest("[data-share]");
  if (s) {
    const p = PROFISSIONAIS.find((x) => x.id === +s.dataset.share);
    const texto = `Conheça ${p.nome} (${CATEGORIAS[p.cat]}) no ConectaServ: ${p.desc}`;
    const link = location.origin + "/perfil.html?id=" + p.id;
    if (navigator.share) {
      try {
        await navigator.share({ title: "ConectaServ", text: texto, url: link });
      } catch (err) {}
    } else
      window.open(
        "https://wa.me/?text=" + encodeURIComponent(texto + " " + link),
        "_blank",
      );
  }
});

// Busca as profissionais na API (e as favoritas da conta, se estiver logada)
Promise.all([
  fetch("/api/profissionais").then((r) => r.json()),
  carregarFavoritas(),
])
  .then(([d]) => {
    PROFISSIONAIS = d;
    render();
  })
  .catch(() => {
    $("#grid").innerHTML =
      '<p class="vazio">Não foi possível carregar as profissionais agora.</p>';
  });
