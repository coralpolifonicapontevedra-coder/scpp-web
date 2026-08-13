function corrixirUsuariosWebPortal() {
  const usuario = buscarUsuarioWebPorEmail_(
    obterPropiedadeObrigatoria_('WEB_TEST_EMAIL')
  );

  console.log(JSON.stringify(usuario));
}
