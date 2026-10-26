// Funções comuns: acessibilidade, máscara de telefone, sessão, cadastro (API), contadores e destaques
const guardar = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch (e) {}
};
const ler = (k) => {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
};

function aplicarAcessibilidade() {
  document.documentElement.classList.toggle(
    "fonte-grande",
    ler("fonteGrande") === "1",
  );
  document.body.classList.toggle(
    "alto-contraste",
    ler("altoContraste") === "1",
  );
  document
    .querySelector('[data-a11y="fonte"]')
    ?.setAttribute("aria-pressed", ler("fonteGrande") === "1");
  document
    .querySelector('[data-a11y="contraste"]')
    ?.setAttribute("aria-pressed", ler("altoContraste") === "1");
}
document.querySelector('[data-a11y="fonte"]')?.addEventListener("click", () => {
  guardar("fonteGrande", ler("fonteGrande") === "1" ? "0" : "1");
  aplicarAcessibilidade();
});
document
  .querySelector('[data-a11y="contraste"]')
  ?.addEventListener("click", () => {
    guardar("altoContraste", ler("altoContraste") === "1" ? "0" : "1");
    aplicarAcessibilidade();
  });
document.querySelector('[data-a11y="voz"]')?.addEventListener("click", () => {
  if (!("speechSynthesis" in window)) {
    alert("Seu navegador não tem leitura em voz alta.");
    return;
  }
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    return;
  }
  const u = new SpeechSynthesisUtterance(
    (document.querySelector("main") || document.body).innerText,
  );
  u.lang = "pt-BR";
  speechSynthesis.speak(u);
});
aplicarAcessibilidade();

// Sessão: quem está logada (as outras páginas esperam por window.authPronto)
function montarNavConta(a) {
  const barra = document.querySelector(".barra-acessibilidade");
  if (!barra) return;
  const nav = document.createElement("div");
  nav.className = "nav-conta";
  if (a.logado) {
    const perfil = document.createElement("a");
    perfil.href = "minha-conta.html";
    perfil.innerHTML = '<i class="fa-solid fa-user"></i> ';
    perfil.append("Olá, " + String(a.nome).split(" ")[0]);
    const sair = document.createElement("button");
    sair.type = "button";
    sair.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Sair';
    sair.addEventListener("click", async () => {
      try {
        await fetch("/api/logout", { method: "POST" });
      } catch (e) {}
      location.href = "index.html";
    });
    nav.append(perfil, sair);
  } else {
    const entrar = document.createElement("a");
    entrar.href = "login.html";
    entrar.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Entrar';
    nav.append(entrar);
  }
  barra.prepend(nav);
}
window.authPronto = fetch("/api/eu")
  .then((r) => r.json())
  .catch(() => ({ logado: false }))
  .then((a) => {
    window.AUTH = a;
    montarNavConta(a);
    return a;
  });

// Máscara (79) 99999-9999
document.querySelectorAll('input[type="tel"]').forEach((el) =>
  el.addEventListener("input", () => {
    let v = el.value.replace(/\D/g, "").slice(0, 11);
    if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
    else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
    el.value = v;
  }),
);

// Cadastro: valida a senha e envia para a API do Flask
document.querySelectorAll("form[data-cadastro]").forEach((form) => {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const s = form.querySelector("#senha"),
      c = form.querySelector("#confirmar-senha");
    const erro = form.querySelector("#erro-senha"),
      aviso = form.querySelector(".aviso-sucesso");
    erro.textContent = "";
    aviso.style.display = "none";
    if (s.value.length < 6) {
      erro.textContent = "A senha precisa ter pelo menos 6 caracteres.";
      s.focus();
      return;
    }
    if (s.value !== c.value) {
      erro.textContent = "As senhas não são iguais.";
      c.focus();
      return;
    }

    const rota = form.querySelector("#categoria")
      ? "trabalhadoras"
      : "clientes";
    const dados = Object.fromEntries(new FormData(form));
    delete dados["confirmar-senha"];
    try {
      const r = await fetch("/api/" + rota, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      const j = await r.json();
      if (!r.ok) {
        erro.textContent = j.erro || "Não foi possível cadastrar.";
        return;
      }
      aviso.style.display = "block";
      form.reset();
    } catch (err) {
      erro.textContent = "Sem conexão com o servidor.";
    }
  });
});

// Contadores de impacto: números reais vindos do banco (página inicial)
function animar(el, alvo) {
  let n = 0;
  const passo = Math.max(1, Math.ceil(alvo / 40));
  if (alvo === 0) {
    el.textContent = "0";
    return;
  }
  const t = setInterval(() => {
    n = Math.min(alvo, n + passo);
    el.textContent = n;
    if (n >= alvo) clearInterval(t);
  }, 35);
}
if (document.querySelector("#stat-mulheres")) {
  fetch("/api/estatisticas")
    .then((r) => r.json())
    .then((d) => {
      animar(document.querySelector("#stat-mulheres"), d.mulheres);
      animar(document.querySelector("#stat-cidades"), d.cidades);
      document.querySelector("#rot-mulheres").textContent =
        d.mulheres === 1 ? "mulher cadastrada" : "mulheres cadastradas";
      document.querySelector("#rot-cidades").textContent =
        d.cidades === 1 ? "cidade atendida" : "cidades atendidas";
    })
    .catch(() => {});
}

// Destaques da página inicial (profissionais marcadas ou as mais recentes)
(function () {
  const grade = document.querySelector("#destaques-grid");
  if (!grade) return;
  const nomes = {
    artesanato: "Artesanato",
    gastronomia: "Gastronomia e Festas",
    estetica: "Beleza e Estética",
    gerais: "Serviços Gerais",
    aulas: "Aulas e Reforço",
    cuidados: "Cuidado com Pessoas e Pets",
  };
  const icones = {
    artesanato: "fa-scroll",
    gastronomia: "fa-cake-candles",
    estetica: "fa-scissors",
    gerais: "fa-broom",
    aulas: "fa-book-open",
    cuidados: "fa-paw",
  };
  fetch("/api/destaques")
    .then((r) => r.json())
    .then((lista) => {
      if (!lista.length) return;
      lista.forEach((p) => {
        const a = document.createElement("a");
        a.className = "card-destaque";
        a.href = "perfil.html?id=" + encodeURIComponent(p.id);
        const av = document.createElement("div");
        av.className = "avatar";
        if (p.foto) {
          const img = document.createElement("img");
          img.src = p.foto;
          img.alt = "Foto de " + p.nome;
          av.append(img);
        } else {
          av.innerHTML = `<i class="fa-solid ${icones[p.cat] || "fa-user"}"></i>`;
        }
        const h = document.createElement("h4");
        h.textContent = p.nome;
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = nomes[p.cat] || "";
        const loc = document.createElement("p");
        loc.textContent = p.local;
        a.append(av, h, tag, loc);
        grade.append(a);
      });
      document.querySelector("#destaques").hidden = false;
    })
    .catch(() => {});
})();
