// Minha conta: edita os dados e a foto de perfil
const $ = (s) => document.querySelector(s);
const form = $("#form-conta"),
  erro = $("#erro-conta"),
  ok = $("#ok-conta");
let eu = null;

function mostrarFoto(url) {
  const av = $("#avatar-conta");
  av.innerHTML = "";
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "Sua foto de perfil";
    av.append(img);
  } else {
    av.innerHTML = '<i class="fa-solid fa-user"></i>';
  }
}

async function iniciar() {
  const a = await window.authPronto;
  if (!a.logado) {
    location.href = "login.html";
    return;
  }
  const r = await fetch("/api/minha-conta");
  if (!r.ok) {
    location.href = "login.html";
    return;
  }
  eu = await r.json();
  form.nome.value = eu.nome || "";
  form.whatsapp.value = eu.whatsapp || "";
  form.cidade.value = eu.cidade || "Outra";
  form.bairro.value = eu.bairro || "";
  if (eu.tipo === "trabalhadora") {
    $("#bloco-trab").hidden = false;
    $("#bloco-foto").hidden = false;
    form.categoria.value = eu.categoria || "";
    form.descricao.value = eu.descricao || "";
    form.instagram.value = eu.instagram || "";
    $("#ver-perfil").href = "perfil.html?id=" + eu.id;
    $("#ver-perfil").hidden = false;
    mostrarFoto(eu.foto);
  }
  $("#carregando").hidden = true;
  form.hidden = false;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  erro.textContent = "";
  ok.style.display = "none";
  const dados = {
    nome: form.nome.value,
    whatsapp: form.whatsapp.value,
    cidade: form.cidade.value,
    bairro: form.bairro.value,
  };
  if (eu.tipo === "trabalhadora") {
    dados.categoria = form.categoria.value;
    dados.descricao = form.descricao.value;
    dados.instagram = form.instagram.value;
  }
  try {
    const r = await fetch("/api/minha-conta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const j = await r.json();
    if (!r.ok) {
      erro.textContent = j.erro || "Não foi possível salvar.";
      return;
    }
    ok.style.display = "block";
  } catch (err) {
    erro.textContent = "Sem conexão com o servidor.";
  }
});

$("#arquivo-foto").addEventListener("change", async (e) => {
  const arq = e.target.files[0];
  const msg = $("#erro-foto");
  msg.textContent = "";
  if (!arq) return;
  if (arq.size > 3 * 1024 * 1024) {
    msg.textContent = "A foto pode ter no máximo 3 MB.";
    return;
  }
  const fd = new FormData();
  fd.append("foto", arq);
  try {
    const r = await fetch("/api/minha-conta/foto", {
      method: "POST",
      body: fd,
    });
    const j = await r.json();
    if (!r.ok) {
      msg.textContent = j.erro || "Não foi possível enviar a foto.";
      return;
    }
    mostrarFoto(j.foto);
  } catch (err) {
    msg.textContent = "Sem conexão com o servidor.";
  }
});
iniciar();
