pm.test('Admin sees the same verticals as in settings', () => {
  const { items } = pm.response.json();
  pm.expect(items).to.have.lengthOf(
    Number(pm.collectionVariables.get('vertical_count')),
  );
  pm.expect(items.map((v) => v.id)).to.include(
    pm.collectionVariables.get('vertical_id'),
  );
});
