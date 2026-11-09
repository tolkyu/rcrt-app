const p = pm.response.json();
pm.test('same values and version: nothing was written', () => {
  pm.expect(p.id).to.equal(pm.collectionVariables.get('position_a_id'));
  pm.expect(p.version).to.equal(
    Number(pm.collectionVariables.get('position_a_version')),
  );
});
