pm.test('only the requested security actions', () => {
  const { items } = pm.response.json();
  pm.expect(items).to.have.length.above(0);
  items.forEach((e) =>
    pm.expect(['auth.login_succeeded', 'auth.logged_out']).to.include(e.action),
  );
});
