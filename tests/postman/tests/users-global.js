pm.test('only users with a global role', () => {
  const { items } = pm.response.json();
  pm.expect(items.map((u) => u.id)).to.include.members([
    pm.collectionVariables.get('admin_id'),
    pm.collectionVariables.get('finance_id'),
  ]);
  items.forEach((u) =>
    pm.expect(u.roles.some((r) => r.vertical === null)).to.equal(true),
  );
});
