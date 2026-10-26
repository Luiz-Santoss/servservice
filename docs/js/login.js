// Login: envia e-mail e senha para a API e leva para a página certa
const form = document.querySelector("#form-login");
const erro = document.querySelector("#erro-login");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  erro.textContent = "";
  try {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email.value,
        senha: form.senha.value,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      erro.textContent = j.erro || "Não foi possível entrar.";
      return;
    }
    location.href =
      j.tipo === "trabalhadora" ? "minha-conta.html" : "catalogo.html";
  } catch (err) {
    erro.textContent = "Sem conexão com o servidor.";
  }
});
