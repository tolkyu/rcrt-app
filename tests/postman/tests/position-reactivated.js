const p = pm.response.json();
const before = Number(pm.collectionVariables.get('position_a_version'));
pm.test('reactivated with one version bump', () => {
  pm.expect(p.isActive).to.equal(true);
  pm.expect(p.version).to.equal(before + 1);
});
pm.collectionVariables.set('position_a_version', p.version);
