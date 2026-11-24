const p = pm.response.json();
pm.test('Admin deactivates a position of any vertical', () => {
  pm.expect(p.id).to.equal(pm.collectionVariables.get('position_b_id'));
  pm.expect(p.isActive).to.equal(false);
  pm.expect(p.name).to.equal(pm.collectionVariables.get('position_b_name'));
});
pm.collectionVariables.set('position_b_version', p.version);
