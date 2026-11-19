const p = pm.response.json();
const before = Number(pm.collectionVariables.get('position_a_version'));
pm.test('renamed with one version bump', () => {
  pm.expect(p.id).to.equal(pm.collectionVariables.get('position_a_id'));
  pm.expect(p.name).to.equal(
    'Тест API ' + pm.collectionVariables.get('position_run') + ' A2',
  );
  pm.expect(p.version).to.equal(before + 1);
});
pm.collectionVariables.set('position_a_version', p.version);
