pm.test('same name and version: nothing was written', () => {
  const vertical = pm.response.json();
  pm.expect(vertical.id).to.equal(pm.collectionVariables.get('vertical_id'));
  pm.expect(vertical.name).to.equal(
    pm.collectionVariables.get('vertical_name'),
  );
  pm.expect(vertical.version).to.equal(
    Number(pm.collectionVariables.get('vertical_version')),
  );
});
