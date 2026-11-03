pm.test('next page continues without overlap or recount', () => {
  const page = pm.response.json();
  const first = JSON.parse(pm.collectionVariables.get('users_first_ids'));
  pm.expect(page.items).to.have.lengthOf(3);
  page.items.forEach((u) => pm.expect(first).to.not.include(u.id));
  pm.expect(page.total).to.equal(null);
});
