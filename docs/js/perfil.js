// Página de perfil: busca uma profissional na API, mostra foto e gera o QR Code
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
const $ = (s) => document.querySelector(s);
const esc = (t) =>
  String(t ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );

// Só aceita links http(s) ou @usuario; qualquer outra coisa vira texto simples
function linkInstagram(v) {
  v = (v || "").trim();
  if (/^https?:\/\//i.test(v)) return v;
  const h = v.replace(/^@/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? "https://instagram.com/" + h : "";
}

function mostrarErro(msg) {
  $("#perfil").innerHTML = `<p class="vazio">${esc(msg)}</p>`;
}

async function carregar() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    mostrarErro("Perfil não encontrado.");
    return;
  }
  try {
    const r = await fetch("/api/profissionais/" + encodeURIComponent(id));
    if (!r.ok) {
      mostrarErro("Perfil não encontrado.");
      return;
    }
    const p = await r.json();
    const a = await window.authPronto;
    desenhar(p, !!a.logado && a.id === p.id);
  } catch (e) {
    mostrarErro("Não foi possível carregar o perfil agora.");
  }
}

function desenhar(p, ehDona) {
  document.title = p.nome + " - ConectaServ";
  const ig = (p.instagram || "").trim(),
    link = linkInstagram(ig);
  const instagram = ig
    ? `<h4>Instagram / portfólio</h4><p>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(ig)}</a>` : esc(ig)}</p>`
    : "";
  const msg = encodeURIComponent(
    `Olá, ${p.nome.split(" ")[0]}! Vi seu perfil na plataforma ConectaServ e gostaria de orçar um serviço.`,
  );
  const avatar = p.foto
    ? `<div class="avatar avatar-grande"><img src="${esc(p.foto)}" alt="Foto de ${esc(p.nome)}"></div>`
    : `<div class="avatar avatar-grande"><i class="fa-solid ${ICONES[p.cat] || "fa-user"}"></i></div>`;
  const editar = ehDona
    ? `<a class="btn-contato" href="minha-conta.html"><i class="fa-solid fa-pen"></i> Editar meu perfil</a>`
    : "";

  $("#perfil").innerHTML = `
  <div class="perfil-card">
    <div class="perfil-topo">
      ${avatar}
      <h2 class="nome">${esc(p.nome)}</h2>
      <span class="tag">${esc(CATEGORIAS[p.cat] || "")}</span>
    </div>
    <div class="perfil-corpo">
      <div class="localizacao"><i class="fa-solid fa-location-dot"></i>${esc(p.local)}</div>
      <h4>Sobre o trabalho</h4>
      <p>${esc(p.desc)}</p>
      ${instagram}
      <div class="perfil-acoes">
        <a class="btn-contato btn-whatsapp" target="_blank" rel="noopener" href="https://wa.me/${esc(p.whats)}?text=${msg}"><i class="fa-brands fa-whatsapp"></i> Contato direto</a>
        <button class="btn-contato" id="compartilhar"><i class="fa-solid fa-share-nodes"></i> Compartilhar</button>
        ${editar}
      </div>
    </div>
    <div class="qr-bloco">
      <h4>QR Code do perfil</h4>
      <p>Baixe e imprima para colocar em embalagens, panfletos e cartões.</p>
      <div id="qr"></div><br>
      <button class="btn-contato" id="baixar-qr" style="display:inline-flex;flex:none;padding:10px 22px"><i class="fa-solid fa-download"></i> Baixar QR Code</button>
    </div>
  </div>`;

  new QRCode($("#qr"), {
    text: location.origin + "/perfil.html?id=" + p.id,
    width: 200,
    height: 200,
    colorDark: "#4A0E17",
    colorLight: "#ffffff",
  });

  $("#compartilhar").onclick = async () => {
    const texto = `Conheça ${p.nome} (${CATEGORIAS[p.cat] || ""}) no ConectaServ: ${p.desc}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "ConectaServ",
          text: texto,
          url: location.href,
        });
      } catch (e) {}
    } else
      window.open(
        "https://wa.me/?text=" +
          encodeURIComponent(texto + " " + location.href),
        "_blank",
      );
  };

  $("#baixar-qr").onclick = () => {
    const cv = $("#qr canvas"),
      img = $("#qr img");
    const a = document.createElement("a");
    a.href = cv ? cv.toDataURL("image/png") : img.src;
    a.download =
      "qrcode-" +
      p.nome
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-") +
      ".png";
    a.click();
  };
}
carregar();
