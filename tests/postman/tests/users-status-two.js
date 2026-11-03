pm.test('active and deactivated users only', () => {
  const { items } = pm.response.json();
  const ids = items.map((u) => u.id);
  items.forEach((u) =>
    pm.expect(['ACTIVE', 'DEACTIVATED']).to.include(u.status),
  );
  pm.expect(ids).to.include(pm.collectionVariables.get('inactive_id'));
  pm.expect(ids).to.include(pm.collectionVariables.get('admin_id'));
  pm.expect(ids).to.not.include(pm.collectionVariables.get('expired_id'));
});
