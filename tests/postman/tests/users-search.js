pm.test('search finds the Team Lead by surname', () => {
  const { items } = pm.response.json();
  pm.expect(items.map((u) => u.id)).to.include(
    pm.collectionVariables.get('vasyl_id'),
  );
  items.forEach((u) => pm.expect(u.fullName).to.include('Мороз'));
});
