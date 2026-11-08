window.addEventListener("error", function () {
  const root = document.querySelector("#adminApp");
  if (root && !root.querySelector("form")) {
    root.innerHTML = '<main class="login-shell"><section class="login-card"><h1>Administração</h1><p class="error">Falha ao carregar o painel. Atualize a página com Ctrl+F5.</p></section></main>';
  }
});
